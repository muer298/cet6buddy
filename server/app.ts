import { questionById, questions } from './data.ts';
import { InMemoryStore, type StudyStore } from './store.ts';
import type { PublicQuestion, SessionMode } from './types.ts';

const DEMO_USER_ID = 'user-demo';

function json(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, idempotency-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

function error(code: string, message: string, status: number, details?: unknown): Response {
  return json({ error: { code, message, details } }, status);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function shanghaiDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function publicQuestion(questionId: string): PublicQuestion | undefined {
  const question = questionById.get(questionId);
  if (!question) return undefined;
  const { correctIndex: _correctIndex, explanation: _explanation, ...safe } = question;
  return safe;
}

export function createApp(store: StudyStore = new InMemoryStore()) {
  async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return json(null, 204);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return json({ status: 'ok', service: 'cet6-buddy-api', time: new Date().toISOString() });
    }

    if (request.method === 'GET' && path === '/api/me/plan') {
      return json({
        server_date: shanghaiDate(),
        timezone: 'Asia/Shanghai',
        plan_tier: 'standard',
        tasks: [
          { id: 'review', title: '到期复习', required: true, target: 20, completed: 20, points: 10 },
          { id: 'new_words', title: '学习新词', required: true, target: 10, completed: 6, points: 10 },
          { id: 'input', title: '听力或阅读', required: true, target: 1, completed: 0, points: 10 },
          { id: 'output', title: '句式或翻译', required: true, target: 2, completed: 2, points: 10 },
          { id: 'game', title: '小游戏', required: false, target: 1, completed: 0, points: 5 },
        ],
      });
    }

    if (request.method === 'POST' && path === '/api/study/sessions') {
      const body = await readJson(request);
      if (!body) return error('INVALID_JSON', '请求体必须是有效 JSON。', 400);
      const source = typeof body.source === 'string' ? body.source : 'due_reviews';
      const mode: SessionMode = body.mode === 'challenge' ? 'challenge' : 'practice';
      const session = await store.createSession({ userId: DEMO_USER_ID, source, mode, questionIds: questions.map(question => question.id) });
      return json({ session: { ...session, questions: session.questionIds.map(publicQuestion) } }, 201);
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === 'GET' && sessionMatch) {
      const session = await store.getSession(sessionMatch[1]);
      if (!session || session.userId !== DEMO_USER_ID) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404);
      return json({ session, attempts: await store.attemptsForSession(session.id) });
    }

    const answerMatch = path.match(/^\/api\/sessions\/([^/]+)\/answers$/);
    if (request.method === 'POST' && answerMatch) {
      const session = await store.getSession(answerMatch[1]);
      if (!session || session.userId !== DEMO_USER_ID) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404);
      if (session.status !== 'active') return error('SESSION_FINISHED', '该学习会话已经结算。', 409);
      const body = await readJson(request);
      if (!body) return error('INVALID_JSON', '请求体必须是有效 JSON。', 400);
      const questionId = typeof body.question_id === 'string' ? body.question_id : '';
      const questionVersion = typeof body.question_version === 'number' ? body.question_version : -1;
      const answerIndex = typeof body.answer === 'number' ? body.answer : -1;
      const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : request.headers.get('idempotency-key') ?? '';
      const question = questionById.get(questionId);
      if (!question || !session.questionIds.includes(questionId)) return error('QUESTION_NOT_IN_SESSION', '题目不属于该学习会话。', 422);
      if (question.version !== questionVersion) return error('QUESTION_VERSION_MISMATCH', '题目版本已经变化，请重新获取会话。', 409, { expected: question.version });
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length) return error('INVALID_ANSWER', '答案选项无效。', 422);
      if (!idempotencyKey) return error('IDEMPOTENCY_KEY_REQUIRED', '提交答案必须提供幂等键。', 400);

      const saved = await store.saveAttempt({ sessionId: session.id, userId: DEMO_USER_ID, questionId, questionVersion, answerIndex, correct: answerIndex === question.correctIndex, idempotencyKey });
      const mayReveal = session.mode === 'practice';
      return json({
        accepted: true,
        duplicate: saved.duplicate,
        attempt_id: saved.attempt.id,
        server_status: 'confirmed',
        feedback: mayReveal ? { correct: saved.attempt.correct, correct_answer: question.correctIndex, explanation: question.explanation } : null,
      });
    }

    const finishMatch = path.match(/^\/api\/sessions\/([^/]+)\/finish$/);
    if (request.method === 'POST' && finishMatch) {
      const session = await store.getSession(finishMatch[1]);
      if (!session || session.userId !== DEMO_USER_ID) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404);
      const attempts = await store.attemptsForSession(session.id);
      if (!attempts.length) return error('NO_ANSWERS', '至少提交一道题后才能结算。', 422);
      await store.finishSession(session.id);
      const correct = attempts.filter(attempt => attempt.correct).length;
      const finishedAll = attempts.length === session.questionIds.length;
      const rewardKey = `${DEMO_USER_ID}:game:${shanghaiDate()}`;
      const reward = finishedAll ? await store.awardPoints(DEMO_USER_ID, rewardKey, 5, '完成一局合格练习并订正') : null;
      return json({
        session_id: session.id,
        status: 'finished',
        result: { answered: attempts.length, total: session.questionIds.length, correct, score: correct * 10 },
        reward: reward ? { points: reward.entry.points, awarded: reward.awarded, reward_key: reward.entry.rewardKey } : { points: 0, awarded: false, reason: '练习尚未完成全部题目' },
      });
    }

    return error('NOT_FOUND', '接口不存在。', 404);
  }

  return { handle, store };
}
