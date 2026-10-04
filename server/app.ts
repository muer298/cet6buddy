import { questionById, questions } from './data.ts';
import { AuthError, AuthService, authOptionsFromEnv, type AuthRuntimeOptions } from './auth.ts';
import { createEmailSender, type EmailSender } from './email.ts';
import { InMemoryStore, type StudyStore } from './store.ts';
import { createCosDownloadUrl, createCosUploadGrant, readLocalAsset, saveLocalFile, UploadError, validateUploadMetadata, verifyCosObject } from './upload.ts';
import type { ContentRecord, GameSessionRecord, GameType, ImportRecord, PublicQuestion, SessionMode, UserAccount, UserRole } from './types.ts';

function json(data: unknown, status = 200, extraHeaders?: HeadersInit, corsOrigin = 'http://127.0.0.1:4173'): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, idempotency-key',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'vary': 'origin',
      ...extraHeaders,
    },
  });
}

function error(code: string, message: string, status: number, details?: unknown, corsOrigin?: string): Response {
  return json({ error: { code, message, details } }, status, undefined, corsOrigin);
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

function nextShanghaiDate(): string {
  return shanghaiDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function publicQuestion(questionId: string): PublicQuestion | undefined {
  const question = questionById.get(questionId);
  if (!question) return undefined;
  const { correctIndex: _correctIndex, explanation: _explanation, ...safe } = question;
  return safe;
}

function gameRules(gameType: GameType, requestedSeconds?: number): GameSessionRecord['rules'] {
  if (gameType === 'root-chain') return { questionCount: 5, secondsPerQuestion: null, ruleVersion: 1 };
  if (gameType === 'flash') return { questionCount: 10, secondsPerQuestion: [12, 20].includes(requestedSeconds ?? 12) ? requestedSeconds ?? 12 : null, ruleVersion: 1 };
  return { questionCount: 10, secondsPerQuestion: null, ruleVersion: 1 };
}

function weekStartUtc(): string {
  const today = shanghaiDate();
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00+08:00`).toISOString();
}

function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function requireRole(user: UserAccount, roles: UserRole[]): void {
  if (!roles.includes(user.role)) throw new AuthError('FORBIDDEN', '当前账号没有执行此操作的权限。', 403);
}

function contentErrors(kind: string, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const text = (key: string) => typeof payload[key] === 'string' && String(payload[key]).trim().length > 0;
  const list = (key: string) => Array.isArray(payload[key]) && (payload[key] as unknown[]).length > 0;
  if (kind === 'word') {
    if (!text('word')) errors.push('缺少单词');
    if (!text('meaning')) errors.push('缺少释义');
  } else if (kind === 'listening') {
    if (!text('title')) errors.push('缺少标题');
    if (!text('asset_id')) errors.push('缺少音频资源');
    if (!list('questions')) errors.push('缺少题目');
  } else if (kind === 'reading') {
    if (!text('title')) errors.push('缺少标题');
    if (!text('passage')) errors.push('缺少文章');
    if (!list('questions')) errors.push('缺少题目');
  } else if (kind === 'translation' || kind === 'writing') {
    if (!text('prompt')) errors.push('缺少题干');
    if (!list('references')) errors.push('缺少参考表达');
  } else {
    errors.push('不支持的内容类型');
  }
  return errors;
}

function pageOf<T>(items: T[], url: URL): { items: T[]; pagination: { page: number; page_size: number; total: number; pages: number } } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('page_size') ?? '20', 10) || 20));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, page_size: pageSize, total: items.length, pages: Math.max(1, Math.ceil(items.length / pageSize)) } };
}

export interface AppOptions {
  emailSender?: EmailSender;
  authOptions?: AuthRuntimeOptions;
  corsOrigin?: string;
}

export function createApp(store: StudyStore = new InMemoryStore(), options: AppOptions = {}) {
  const corsOrigin = options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://127.0.0.1:4173';
  const auth = new AuthService(store, options.emailSender ?? createEmailSender(), options.authOptions ?? authOptionsFromEnv());

  async function route(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return json(null, 204, undefined, corsOrigin);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return json({ status: 'ok', service: 'cet6-buddy-api', time: new Date().toISOString() }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/auth/email/request') {
      const body = await readJson(request);
      if (!body || typeof body.email !== 'string') return error('INVALID_EMAIL', '请输入邮箱地址。', 422, undefined, corsOrigin);
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const requestIp = forwarded || request.headers.get('x-real-ip') || 'local';
      const result = await auth.requestCode(body.email, requestIp);
      return json({ accepted: true, expires_in: result.expiresIn, ...(result.debugCode ? { debug_code: result.debugCode } : {}) }, 202, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/auth/email/verify') {
      const body = await readJson(request);
      if (!body || typeof body.email !== 'string' || typeof body.code !== 'string') return error('INVALID_AUTH_PAYLOAD', '邮箱和验证码不能为空。', 422, undefined, corsOrigin);
      const result = await auth.verifyCode(body.email, body.code);
      return json({ user: result.user }, 200, { 'set-cookie': result.cookie }, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/auth/logout') {
      const cookie = await auth.logout(request);
      return json({ logged_out: true }, 200, { 'set-cookie': cookie }, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/me') {
      return json({ user: await auth.requireUser(request) }, 200, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/me/plan') {
      const user = await auth.requireUser(request);
      const planDate = shanghaiDate();
      const planTier = await store.getPlanTier(user.id, planDate);
      const tasks = await store.getDailyTasks(user.id, planDate, planTier);
      return json({
        server_date: planDate,
        timezone: 'Asia/Shanghai',
        plan_tier: planTier,
        tasks: tasks.map(task => ({ id: task.key, ...task })),
      }, 200, undefined, corsOrigin);
    }

    if (request.method === 'PUT' && path === '/api/me/plan') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      const tier = body?.plan_tier;
      if (tier !== 'light' && tier !== 'standard' && tier !== 'custom') return error('INVALID_PLAN_TIER', '计划档位无效。', 422, undefined, corsOrigin);
      const rawExamDate = body?.exam_date;
      const examDate = typeof rawExamDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawExamDate) ? rawExamDate : undefined;
      const effectiveDate = nextShanghaiDate();
      await store.schedulePlan(user.id, tier, effectiveDate, examDate);
      return json({ accepted: true, plan_tier: tier, effective_date: effectiveDate, exam_date: examDate }, 202, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/me/checkin') {
      const user = await auth.requireUser(request);
      return json({ checkin: await store.getCheckin(user.id, shanghaiDate()) ?? null }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/me/checkin') {
      const user = await auth.requireUser(request);
      const date = shanghaiDate();
      const tier = await store.getPlanTier(user.id, date);
      const tasks = await store.getDailyTasks(user.id, date, tier);
      const pending = tasks.filter(task => task.required && task.completed < task.target);
      if (pending.length) return error('CHECKIN_NOT_READY', '完成全部必做任务后才能打卡。', 422, { pending: pending.map(task => task.key) }, corsOrigin);
      return json({ checkin: await store.createCheckin(user.id, date, tier) }, 201, undefined, corsOrigin);
    }

    const taskCompleteMatch = path.match(/^\/api\/me\/tasks\/(input)\/complete$/);
    if (request.method === 'POST' && taskCompleteMatch) {
      const user = await auth.requireUser(request);
      const date = shanghaiDate();
      const tier = await store.getPlanTier(user.id, date);
      const tasks = await store.incrementDailyTask(user.id, date, 'input', 1, tier);
      const task = tasks.find(item => item.key === 'input')!;
      const reward = task.completed >= task.target ? await store.awardPoints(user.id, `${user.id}:input:${date}`, task.points, '完成听力或阅读任务') : null;
      return json({ task, reward: reward ? { points: reward.entry.points, awarded: reward.awarded } : null }, 200, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/me/reviews') {
      const user = await auth.requireUser(request);
      const dueBefore = url.searchParams.get('due_before') ?? new Date().toISOString();
      const result = pageOf(await store.listReviews(user.id, dueBefore), url);
      return json({ reviews: result.items, pagination: result.pagination }, 200, undefined, corsOrigin);
    }

    const reviewMatch = path.match(/^\/api\/reviews\/([^/]+)\/complete$/);
    if (request.method === 'POST' && reviewMatch) {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      const skill = body?.skill;
      if (!['meaning', 'spelling', 'listening', 'reading', 'output'].includes(String(skill))) return error('INVALID_REVIEW_SKILL', '复习类型无效。', 422, undefined, corsOrigin);
      if (typeof body?.correct !== 'boolean') return error('INVALID_REVIEW_RESULT', '复习结果无效。', 422, undefined, corsOrigin);
      const review = await store.updateReviewState(user.id, reviewMatch[1], skill as 'meaning' | 'spelling' | 'listening' | 'reading' | 'output', body.correct, new Date().toISOString());
      await store.incrementDailyTask(user.id, shanghaiDate(), 'review', 1, await store.getPlanTier(user.id, shanghaiDate()));
      return json({ review }, 200, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/collections') {
      const user = await auth.requireUser(request);
      const result = pageOf(await store.listCollections(user.id, url.searchParams.get('kind') ?? undefined), url);
      return json({ items: result.items, pagination: result.pagination }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/collections') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body || typeof body.content_item_id !== 'string' || typeof body.kind !== 'string') return error('INVALID_COLLECTION', '收藏内容无效。', 422, undefined, corsOrigin);
      const entry = await store.addCollection({ userId: user.id, contentItemId: body.content_item_id, contentVersion: typeof body.content_version === 'number' ? body.content_version : 1, kind: body.kind, note: typeof body.note === 'string' ? body.note : undefined });
      return json({ item: entry }, 201, undefined, corsOrigin);
    }

    const correctionMatch = path.match(/^\/api\/attempts\/([^/]+)\/corrections$/);
    if (request.method === 'POST' && correctionMatch) {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body || !('answer' in body)) return error('INVALID_CORRECTION', '订正答案不能为空。', 422, undefined, corsOrigin);
      const saved = await store.saveCorrection(user.id, correctionMatch[1], body.answer, typeof body.self_check === 'object' && body.self_check ? body.self_check as Record<string, boolean> : undefined);
      if (!saved) return error('ATTEMPT_NOT_FOUND', '没有找到可订正的作答。', 404, undefined, corsOrigin);
      return json({ accepted: true }, 201, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/open-submissions') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body || (body.module !== 'translation' && body.module !== 'writing') || typeof body.prompt_id !== 'string' || typeof body.response_text !== 'string' || !body.response_text.trim()) return error('INVALID_OPEN_SUBMISSION', '开放表达内容不完整。', 422, undefined, corsOrigin);
      const submission = await store.saveOpenSubmission({ userId: user.id, module: body.module, promptId: body.prompt_id, responseText: body.response_text.trim(), selfCheck: typeof body.self_check === 'object' && body.self_check ? body.self_check as Record<string, boolean> : {} });
      const tier = await store.getPlanTier(user.id, shanghaiDate());
      const tasks = await store.incrementDailyTask(user.id, shanghaiDate(), 'output', 1, tier);
      const outputTask = tasks.find(task => task.key === 'output');
      const reward = outputTask?.completed === outputTask?.target ? await store.awardPoints(user.id, `${user.id}:output:${shanghaiDate()}`, 10, '完成句式或翻译积累任务') : null;
      return json({ submission, reward: reward ? { points: reward.entry.points, awarded: reward.awarded } : null }, 201, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/games/sessions') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      const gameType = body?.game_type;
      if (gameType !== 'root-chain' && gameType !== 'flash' && gameType !== 'streak') return error('INVALID_GAME_TYPE', '游戏类型无效。', 422, undefined, corsOrigin);
      const rules = gameRules(gameType, typeof body?.seconds_per_question === 'number' ? body.seconds_per_question : undefined);
      if (questions.length < rules.questionCount) return error('INSUFFICIENT_QUESTION_POOL', '当前题源不足，无法开始本局。', 409, { required: rules.questionCount, available: questions.length }, corsOrigin);
      const questionIds = questions.slice(0, rules.questionCount).map(question => question.id);
      const session = await store.createGameSession({ userId: user.id, gameType, mode: 'practice', questionIds, rules });
      return json({ session: { ...session, questions: questionIds.map(publicQuestion) } }, 201, undefined, corsOrigin);
    }

    const gameSessionMatch = path.match(/^\/api\/game-sessions\/([^/]+)$/);
    if (request.method === 'GET' && gameSessionMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getGameSession(gameSessionMatch[1]);
      if (!session || session.userId !== user.id) return error('GAME_SESSION_NOT_FOUND', '没有找到该游戏会话。', 404, undefined, corsOrigin);
      return json({ session: { ...session, questions: session.questionIds.map(publicQuestion) }, attempts: await store.gameAttempts(session.id) }, 200, undefined, corsOrigin);
    }

    const gameAnswerMatch = path.match(/^\/api\/game-sessions\/([^/]+)\/answers$/);
    if (request.method === 'POST' && gameAnswerMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getGameSession(gameAnswerMatch[1]);
      if (!session || session.userId !== user.id) return error('GAME_SESSION_NOT_FOUND', '没有找到该游戏会话。', 404, undefined, corsOrigin);
      if (session.status !== 'active') return error('GAME_SESSION_FINISHED', '本局已经结算。', 409, undefined, corsOrigin);
      const body = await readJson(request);
      const attempts = await store.gameAttempts(session.id);
      const expectedQuestionId = session.questionIds[attempts.length];
      const questionId = typeof body?.question_id === 'string' ? body.question_id : '';
      if (!expectedQuestionId || questionId !== expectedQuestionId) return error('GAME_QUESTION_ORDER', '请按本局冻结顺序作答。', 409, { expected_question_id: expectedQuestionId }, corsOrigin);
      const question = questionById.get(questionId);
      const questionVersion = typeof body?.question_version === 'number' ? body.question_version : -1;
      if (!question || question.version !== questionVersion) return error('QUESTION_VERSION_MISMATCH', '题目版本已经变化。', 409, undefined, corsOrigin);
      const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : request.headers.get('idempotency-key') ?? '';
      if (!idempotencyKey) return error('IDEMPOTENCY_KEY_REQUIRED', '提交答案必须提供幂等键。', 400, undefined, corsOrigin);
      const submittedIndex = typeof body?.answer === 'number' ? body.answer : null;
      const lastActivity = attempts.at(-1)?.submittedAt ?? session.createdAt;
      const timedOut = session.rules.secondsPerQuestion !== null && Date.now() - new Date(lastActivity).getTime() > session.rules.secondsPerQuestion * 1000;
      const answerIndex = timedOut ? null : submittedIndex;
      if (answerIndex !== null && (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length)) return error('INVALID_ANSWER', '答案选项无效。', 422, undefined, corsOrigin);
      const saved = await store.submitGameAnswer({ gameSessionId: session.id, userId: user.id, questionId, questionVersion, answerIndex, correct: answerIndex === question.correctIndex, idempotencyKey });
      return json({ accepted: true, duplicate: saved.duplicate, timed_out: timedOut, attempt_id: saved.attempt.id, points: saved.attempt.points, score: saved.session.score, streak: saved.session.currentStreak, feedback: session.mode === 'practice' ? { correct: saved.attempt.correct, correct_answer: question.correctIndex, explanation: question.explanation } : null }, 200, undefined, corsOrigin);
    }

    const gameFinishMatch = path.match(/^\/api\/game-sessions\/([^/]+)\/finish$/);
    if (request.method === 'POST' && gameFinishMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getGameSession(gameFinishMatch[1]);
      if (!session || session.userId !== user.id) return error('GAME_SESSION_NOT_FOUND', '没有找到该游戏会话。', 404, undefined, corsOrigin);
      const attempts = await store.gameAttempts(session.id);
      if (attempts.length !== session.questionIds.length) return error('GAME_INCOMPLETE', '请完成整局后再结算。', 422, { answered: attempts.length, total: session.questionIds.length }, corsOrigin);
      const finished = await store.finishGameSession(session.id);
      const tier = await store.getPlanTier(user.id, shanghaiDate());
      const tasks = await store.incrementDailyTask(user.id, shanghaiDate(), 'game', 1, tier);
      const gameTask = tasks.find(task => task.key === 'game');
      const reward = gameTask?.completed === gameTask?.target ? await store.awardPoints(user.id, `${user.id}:game:${shanghaiDate()}`, 5, '完成一局合格小游戏并订正') : null;
      return json({ session: finished, result: { answered: attempts.length, correct: finished?.correctCount ?? 0, score: finished?.score ?? 0, longest_streak: finished?.longestStreak ?? 0 }, reward: reward ? { points: 5, awarded: reward.awarded } : null }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/teams') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
      if (name.length < 2) return error('INVALID_TEAM_NAME', '小队名称至少需要 2 个字符。', 422, undefined, corsOrigin);
      if (await store.getTeamOverview(user.id, weekStartUtc())) return error('ALREADY_IN_TEAM', '你已经加入一个小队。', 409, undefined, corsOrigin);
      const team = await store.createTeam({ name, ownerId: user.id, inviteCode: inviteCode(), inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
      return json({ team }, 201, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/teams/join') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (await store.getTeamOverview(user.id, weekStartUtc())) return error('ALREADY_IN_TEAM', '你已经加入一个小队。', 409, undefined, corsOrigin);
      const team = typeof body?.invite_code === 'string' ? await store.joinTeam(body.invite_code.trim().toUpperCase(), user.id) : undefined;
      if (!team) return error('INVITE_INVALID', '邀请码无效、已过期或小队已满。', 422, undefined, corsOrigin);
      return json({ team }, 200, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/teams/me') {
      const user = await auth.requireUser(request);
      const overview = await store.getTeamOverview(user.id, weekStartUtc());
      return json({ overview }, 200, undefined, corsOrigin);
    }

    const leaderboardMatch = path.match(/^\/api\/teams\/([^/]+)\/leaderboard$/);
    if (request.method === 'GET' && leaderboardMatch) {
      const user = await auth.requireUser(request);
      const overview = await store.getTeamOverview(user.id, weekStartUtc());
      if (!overview || overview.team.id !== leaderboardMatch[1]) return error('TEAM_FORBIDDEN', '你不是该小队成员。', 403, undefined, corsOrigin);
      return json({ week_start: weekStartUtc(), ...overview }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/challenges') {
      const user = await auth.requireUser(request);
      const overview = await store.getTeamOverview(user.id, weekStartUtc());
      if (!overview) return error('TEAM_REQUIRED', '请先创建或加入小队。', 409, undefined, corsOrigin);
      const body = await readJson(request);
      const gameType = body?.game_type;
      if (gameType !== 'root-chain' && gameType !== 'flash' && gameType !== 'streak') return error('INVALID_GAME_TYPE', '挑战玩法无效。', 422, undefined, corsOrigin);
      const rules = gameRules(gameType, typeof body?.seconds_per_question === 'number' ? body.seconds_per_question : undefined);
      const deadlineAt = typeof body?.deadline_at === 'string' && new Date(body.deadline_at).getTime() > Date.now() ? body.deadline_at : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const challenge = await store.createChallenge({ teamId: overview.team.id, creatorId: user.id, gameType, title: typeof body?.title === 'string' ? body.title.slice(0, 120) : '小队同题挑战', rules, questionIds: questions.slice(0, rules.questionCount).map(question => question.id), deadlineAt });
      return json({ challenge }, 201, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/challenges') {
      const user = await auth.requireUser(request);
      const overview = await store.getTeamOverview(user.id, weekStartUtc());
      const result = pageOf(overview ? await store.listChallenges(overview.team.id) : [], url);
      return json({ challenges: result.items, pagination: result.pagination }, 200, undefined, corsOrigin);
    }

    const challengeStartMatch = path.match(/^\/api\/challenges\/([^/]+)\/start$/);
    if (request.method === 'POST' && challengeStartMatch) {
      const user = await auth.requireUser(request);
      const challenge = await store.getChallenge(challengeStartMatch[1]);
      const overview = await store.getTeamOverview(user.id, weekStartUtc());
      if (!challenge || !overview || challenge.teamId !== overview.team.id) return error('CHALLENGE_FORBIDDEN', '无法参加该挑战。', 403, undefined, corsOrigin);
      if (challenge.status !== 'open' || challenge.deadlineAt <= new Date().toISOString()) return error('CHALLENGE_CLOSED', '挑战已经截止。', 409, undefined, corsOrigin);
      const started = await store.startChallenge(challenge.id, user.id);
      return json({ participation: started.participation, duplicate: started.duplicate, session: { ...started.game, questions: started.game.questionIds.map(publicQuestion) } }, started.duplicate ? 200 : 201, undefined, corsOrigin);
    }

    const challengeAnswerMatch = path.match(/^\/api\/challenges\/([^/]+)\/answers$/);
    if (request.method === 'POST' && challengeAnswerMatch) {
      const user = await auth.requireUser(request);
      const started = await store.startChallenge(challengeAnswerMatch[1], user.id);
      const body = await readJson(request);
      if (!body) return error('INVALID_JSON', '请求体必须是有效 JSON。', 400, undefined, corsOrigin);
      const proxy = new Request(new URL(`/api/game-sessions/${started.game.id}/answers`, request.url), { method: 'POST', headers: request.headers, body: JSON.stringify(body) });
      const proxied = await route(proxy);
      if (!proxied.ok) return proxied;
      const accepted = await proxied.json() as Record<string, unknown>;
      return json({ accepted: true, duplicate: accepted.duplicate, timed_out: accepted.timed_out, server_status: 'confirmed', feedback: null }, 200, undefined, corsOrigin);
    }

    const challengeFinishMatch = path.match(/^\/api\/challenges\/([^/]+)\/finish$/);
    if (request.method === 'POST' && challengeFinishMatch) {
      const user = await auth.requireUser(request);
      const started = await store.startChallenge(challengeFinishMatch[1], user.id);
      const attempts = await store.gameAttempts(started.game.id);
      if (attempts.length !== started.game.questionIds.length) return error('GAME_INCOMPLETE', '请完成整局后再提交挑战。', 422, undefined, corsOrigin);
      const game = await store.finishGameSession(started.game.id);
      const participation = game ? await store.finishChallengeParticipation(challengeFinishMatch[1], user.id, game) : undefined;
      return json({ submitted: true, revealed: false, participation_id: participation?.id }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/uploads') {
      const user = await auth.requireUser(request);
      if ((process.env.UPLOAD_DRIVER ?? 'local') !== 'local') return error('LOCAL_UPLOAD_DISABLED', '当前环境仅允许使用 COS 直传。', 409, undefined, corsOrigin);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return error('FILE_REQUIRED', '请选择要上传的文件。', 422, undefined, corsOrigin);
      const saved = await saveLocalFile(file, user.id);
      const asset = await store.createAsset({ ownerId: user.id, objectKey: saved.objectKey, originalName: file.name, mimeType: file.type, byteSize: file.size, sha256: saved.sha256, visibility: 'private' });
      const importRecord = await store.createImport(user.id, asset.id);
      return json({ asset, import: importRecord }, 201, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/uploads/credentials') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body || typeof body.file_name !== 'string' || typeof body.mime_type !== 'string' || typeof body.byte_size !== 'number') return error('INVALID_UPLOAD', '上传信息不完整。', 422, undefined, corsOrigin);
      return json(await createCosUploadGrant(user.id, body.file_name, body.mime_type, body.byte_size), 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/uploads/confirm') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body || typeof body.object_key !== 'string' || !body.object_key.startsWith(`private/${user.id}/`) || typeof body.original_name !== 'string' || typeof body.mime_type !== 'string' || typeof body.byte_size !== 'number' || typeof body.sha256 !== 'string') return error('INVALID_UPLOAD_CONFIRMATION', '上传确认信息不完整。', 422, undefined, corsOrigin);
      validateUploadMetadata(body.original_name, body.mime_type, body.byte_size);
      await verifyCosObject(body.object_key, body.byte_size, body.sha256);
      const asset = await store.createAsset({ ownerId: user.id, objectKey: body.object_key, originalName: body.original_name, mimeType: body.mime_type, byteSize: body.byte_size, sha256: body.sha256, visibility: 'private' });
      const importRecord = await store.createImport(user.id, asset.id);
      return json({ asset, import: importRecord }, 201, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/imports') {
      const user = await auth.requireUser(request);
      const all = url.searchParams.get('all') === 'true';
      if (all) requireRole(user, ['editor', 'admin']);
      const result = pageOf(await store.listImports(user.id, all), url);
      return json({ imports: result.items, pagination: result.pagination }, 200, undefined, corsOrigin);
    }

    const assetDownloadMatch = path.match(/^\/api\/assets\/([^/]+)\/download$/);
    if (request.method === 'GET' && assetDownloadMatch) {
      const user = await auth.requireUser(request);
      const asset = await store.getAsset(assetDownloadMatch[1]);
      if (!asset || (asset.ownerId !== user.id && user.role === 'learner')) return error('ASSET_NOT_FOUND', '没有找到该附件。', 404, undefined, corsOrigin);
      if ((process.env.UPLOAD_DRIVER ?? 'local') === 'cos') {
        const location = await createCosDownloadUrl(asset.objectKey);
        return new Response(null, { status: 302, headers: { location, 'cache-control': 'private, no-store', 'access-control-allow-origin': corsOrigin, 'access-control-allow-credentials': 'true' } });
      }
      const bytes = await readLocalAsset(asset.objectKey);
      const body = Uint8Array.from(bytes).buffer;
      return new Response(body, { status: 200, headers: { 'content-type': asset.mimeType, 'content-length': String(asset.byteSize), 'content-disposition': 'attachment', 'cache-control': 'private, no-store', 'access-control-allow-origin': corsOrigin, 'access-control-allow-credentials': 'true' } });
    }

    const importStatusMatch = path.match(/^\/api\/admin\/imports\/([^/]+)\/status$/);
    if (request.method === 'POST' && importStatusMatch) {
      const user = await auth.requireUser(request);
      requireRole(user, ['editor', 'admin']);
      const body = await readJson(request);
      const status = body?.status;
      const allowed: ImportRecord['status'][] = ['uploaded', 'draft', 'validating', 'review', 'published', 'withdrawn'];
      if (!allowed.includes(status as ImportRecord['status'])) return error('INVALID_IMPORT_STATUS', '导入状态无效。', 422, undefined, corsOrigin);
      const updated = await store.updateImport(importStatusMatch[1], status as ImportRecord['status'], user.id, Array.isArray(body?.errors) ? body.errors.map(String) : []);
      if (!updated) return error('IMPORT_NOT_FOUND', '没有找到该导入记录。', 404, undefined, corsOrigin);
      return json({ import: updated }, 200, undefined, corsOrigin);
    }

    if (request.method === 'GET' && path === '/api/admin/content') {
      const user = await auth.requireUser(request);
      requireRole(user, ['editor', 'admin']);
      const result = pageOf(await store.listContent(), url);
      return json({ content: result.items, pagination: result.pagination }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/admin/content') {
      const user = await auth.requireUser(request);
      requireRole(user, ['editor', 'admin']);
      const body = await readJson(request);
      if (!body || typeof body.kind !== 'string' || typeof body.payload !== 'object' || !body.payload || Array.isArray(body.payload)) return error('INVALID_CONTENT', '内容字段不完整。', 422, undefined, corsOrigin);
      const record = await store.createContent({ kind: body.kind, ownerId: user.id, visibility: body.visibility === 'private' ? 'private' : 'public', payload: body.payload as Record<string, unknown> });
      return json({ content: record, validation_errors: contentErrors(record.kind, record.payload) }, 201, undefined, corsOrigin);
    }

    const contentVersionMatch = path.match(/^\/api\/admin\/content\/([^/]+)\/versions$/);
    if (request.method === 'POST' && contentVersionMatch) {
      const user = await auth.requireUser(request);
      requireRole(user, ['editor', 'admin']);
      const body = await readJson(request);
      if (!body || typeof body.payload !== 'object' || !body.payload || Array.isArray(body.payload)) return error('INVALID_CONTENT', '版本内容不能为空。', 422, undefined, corsOrigin);
      const record = await store.createContentVersion(contentVersionMatch[1], body.payload as Record<string, unknown>);
      if (!record) return error('CONTENT_NOT_FOUND', '没有找到该内容。', 404, undefined, corsOrigin);
      return json({ content: record, validation_errors: contentErrors(record.kind, record.payload) }, 201, undefined, corsOrigin);
    }

    const contentStatusMatch = path.match(/^\/api\/admin\/content\/([^/]+)\/(publish|withdraw)$/);
    if (request.method === 'POST' && contentStatusMatch) {
      const user = await auth.requireUser(request);
      requireRole(user, ['editor', 'admin']);
      const body = await readJson(request);
      const record = (await store.listContent()).find(item => item.id === contentStatusMatch[1]);
      if (!record) return error('CONTENT_NOT_FOUND', '没有找到该内容。', 404, undefined, corsOrigin);
      if (contentStatusMatch[2] === 'publish') {
        const errors = contentErrors(record.kind, record.payload);
        if (errors.length) return error('CONTENT_VALIDATION_FAILED', '内容字段校验未通过。', 422, { errors }, corsOrigin);
      }
      const status: ContentRecord['status'] = contentStatusMatch[2] === 'publish' ? 'published' : 'withdrawn';
      const updated = await store.updateContentStatus(record.id, record.version, status, user.id, typeof body?.reason === 'string' ? body.reason : undefined);
      return json({ content: updated }, 200, undefined, corsOrigin);
    }

    if (request.method === 'POST' && path === '/api/study/sessions') {
      const user = await auth.requireUser(request);
      const body = await readJson(request);
      if (!body) return error('INVALID_JSON', '请求体必须是有效 JSON。', 400);
      const source = typeof body.source === 'string' ? body.source : 'due_reviews';
      const mode: SessionMode = body.mode === 'challenge' ? 'challenge' : 'practice';
      const session = await store.createSession({ userId: user.id, source, mode, questionIds: questions.slice(0, 5).map(question => question.id) });
      return json({ session: { ...session, questions: session.questionIds.map(publicQuestion) } }, 201, undefined, corsOrigin);
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === 'GET' && sessionMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getSession(sessionMatch[1]);
      if (!session || session.userId !== user.id) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404, undefined, corsOrigin);
      return json({ session, attempts: await store.attemptsForSession(session.id) }, 200, undefined, corsOrigin);
    }

    const resumeMatch = path.match(/^\/api\/sessions\/([^/]+)\/resume$/);
    if (request.method === 'GET' && resumeMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getSession(resumeMatch[1]);
      if (!session || session.userId !== user.id) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404, undefined, corsOrigin);
      return json({ session: { ...session, questions: session.questionIds.map(publicQuestion) }, attempts: await store.attemptsForSession(session.id) }, 200, undefined, corsOrigin);
    }

    const answerMatch = path.match(/^\/api\/sessions\/([^/]+)\/answers$/);
    if (request.method === 'POST' && answerMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getSession(answerMatch[1]);
      if (!session || session.userId !== user.id) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404, undefined, corsOrigin);
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

      const saved = await store.saveAttempt({ sessionId: session.id, userId: user.id, questionId, questionVersion, answerIndex, correct: answerIndex === question.correctIndex, idempotencyKey });
      const mayReveal = session.mode === 'practice';
      return json({
        accepted: true,
        duplicate: saved.duplicate,
        attempt_id: saved.attempt.id,
        server_status: 'confirmed',
        feedback: mayReveal ? { correct: saved.attempt.correct, correct_answer: question.correctIndex, explanation: question.explanation } : null,
      }, 200, undefined, corsOrigin);
    }

    const finishMatch = path.match(/^\/api\/sessions\/([^/]+)\/finish$/);
    if (request.method === 'POST' && finishMatch) {
      const user = await auth.requireUser(request);
      const session = await store.getSession(finishMatch[1]);
      if (!session || session.userId !== user.id) return error('SESSION_NOT_FOUND', '没有找到该学习会话。', 404, undefined, corsOrigin);
      const attempts = await store.attemptsForSession(session.id);
      if (!attempts.length) return error('NO_ANSWERS', '至少提交一道题后才能结算。', 422);
      await store.finishSession(session.id);
      const correct = attempts.filter(attempt => attempt.correct).length;
      const finishedAll = attempts.length === session.questionIds.length;
      const now = new Date().toISOString();
      for (const attempt of attempts) await store.updateReviewState(user.id, attempt.questionId, 'meaning', attempt.correct, now);
      const taskKey = session.source === 'new_words' ? 'new_words' : session.source === 'game' ? 'game' : 'review';
      const tier = await store.getPlanTier(user.id, shanghaiDate());
      const tasks = await store.incrementDailyTask(user.id, shanghaiDate(), taskKey, attempts.length, tier);
      const task = tasks.find(item => item.key === taskKey);
      const rewardKey = `${user.id}:${taskKey}:${shanghaiDate()}`;
      const reward = finishedAll && task && task.completed >= task.target ? await store.awardPoints(user.id, rewardKey, task.points, `完成${task.title}任务`) : null;
      return json({
        session_id: session.id,
        status: 'finished',
        result: { answered: attempts.length, total: session.questionIds.length, correct, score: correct * 10 },
        reward: reward ? { points: reward.entry.points, awarded: reward.awarded, reward_key: reward.entry.rewardKey } : { points: 0, awarded: false, reason: '练习尚未完成全部题目' },
      }, 200, undefined, corsOrigin);
    }

    return error('NOT_FOUND', '接口不存在。', 404, undefined, corsOrigin);
  }

  async function handle(request: Request): Promise<Response> {
    try {
      return await route(request);
    } catch (cause) {
      if (cause instanceof AuthError) return error(cause.code, cause.message, cause.status, undefined, corsOrigin);
      if (cause instanceof UploadError) return error(cause.code, cause.message, cause.status, undefined, corsOrigin);
      throw cause;
    }
  }

  return { handle, store, auth };
}
