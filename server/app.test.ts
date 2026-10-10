import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { InMemoryStore, type StudyStore } from './store.ts';
import type { UserRole } from './types.ts';
import { legacyContent } from './legacy-content.ts';
import { questionById } from './data.ts';
import { decodeSelection, encodeSelection } from './question-bank.ts';

async function body(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

const TEST_PASSWORD = 'Test-password-2026';

test('dashboard has real zeroes, isolates accounts, and reads ledger rather than task estimates', async () => {
  const store = new InMemoryStore();
  const first = await authenticated('dashboard-a@example.com', store);
  const second = await authenticated('dashboard-b@example.com', store);
  const me = (await body(await first.request('http://local/api/me'))).user;
  const empty = await body(await first.request('http://local/api/me/learning-summary'));
  assert.equal(empty.practicedWords, 0);
  assert.equal(empty.collections, 0);
  assert.equal(empty.mistakes, 0);
  assert.equal(empty.reviews, 0);
  const session = (await body(await first.request('http://local/api/study/sessions', { method: 'POST', body: '{}' }))).session;
  const question = session.questions[0];
  const correct = questionById.get(question.id)!.correctIndex;
  const response = await body(await first.request(`http://local/api/sessions/${session.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: (correct + 1) % question.options.length, idempotency_key: 'dashboard-wrong' }) }));
  await store.addCollection({ userId: me.id, contentItemId: question.id, contentVersion: question.version, kind: 'word' });
  await store.updateReviewState(me.id, question.id, 'meaning', false, '2020-01-01T00:00:00Z');
  await store.updateReviewState(me.id, question.id, 'spelling', false, '2020-01-01T00:00:00Z');
  await store.awardPoints(me.id, 'dashboard-reward', 3, '测试实际账本');
  const summary = await body(await first.request('http://local/api/me/learning-summary'));
  assert.equal(summary.practicedWords, 1);
  assert.equal(summary.collections, 1);
  assert.equal(summary.mistakes, 1);
  assert.equal(summary.reviews, 2);
  assert.equal(summary.todayPoints, 3);
  assert.equal((await body(await first.request('http://local/api/me/plan'))).earned_points, 3);
  const other = await body(await second.request('http://local/api/me/learning-summary?user_id=' + me.id));
  assert.equal(other.collections + other.reviews + other.mistakes + other.practicedWords + other.todayPoints, 0);
  const list = await body(await first.request('http://local/api/me/learning-items?filter=mistakes'));
  assert.equal(list.items[0].title, question.word);
  assert.equal(list.items[0].question.correctIndex, undefined);
  assert.equal((await second.request(`http://local/api/attempts/${response.attempt_id}/corrections`, { method: 'POST', body: JSON.stringify({ answer: correct }) })).status, 404);
  assert.equal((await first.request(`http://local/api/attempts/${response.attempt_id}/corrections`, { method: 'POST', body: JSON.stringify({ answer: (correct + 1) % question.options.length }) })).status, 422);
  assert.equal((await first.request(`http://local/api/attempts/${response.attempt_id}/corrections`, { method: 'POST', body: JSON.stringify({ answer: correct }) })).status, 201);
  assert.equal((await body(await first.request('http://local/api/me/learning-summary'))).mistakes, 0);
  assert.equal((await store.attemptsForSession(session.id))[0].correct, false);
  const page = await body(await first.request('http://local/api/me/learning-items?filter=reviews&page_size=1&page=2'));
  assert.equal(page.pagination.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal((await first.handle(new Request('http://local/api/me/learning-summary'))).status, 401);
});

test('dashboard excludes challenge answers and keeps unavailable collections without leaking private titles', async () => {
  const store = new InMemoryStore();
  const { request } = await authenticated('dashboard-private@example.com', store);
  const user = (await body(await request('http://local/api/me'))).user;
  const hidden = await store.createContent({ kind: 'word', ownerId: 'other-user', visibility: 'private', payload: { ...legacyContent[0].payload, word: 'PRIVATE-TITLE' } });
  await store.updateContentStatus(hidden.id, 1, 'published', 'other-user');
  await store.addCollection({ userId: user.id, contentItemId: hidden.id, contentVersion: 1, kind: 'word' });
  const session = (await body(await request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ mode: 'challenge' }) }))).session;
  const q = session.questions[0];
  await request(`http://local/api/sessions/${session.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: q.id, question_version: q.version, answer: (questionById.get(q.id)!.correctIndex + 1) % q.options.length, idempotency_key: 'private-challenge' }) });
  const result = await body(await request('http://local/api/me/learning-summary'));
  assert.equal(result.mistakes, 0);
  assert.equal(result.practicedWords, 0);
  const collections = await body(await request('http://local/api/me/learning-items?filter=collections'));
  assert.equal(collections.items[0].available, false);
  assert.equal(JSON.stringify(collections).includes('PRIVATE-TITLE'), false);
});

test('output exercises and module counts use validated published content', async () => {
  const store = new InMemoryStore();
  const { request } = await authenticated('output-dashboard@example.com', store);
  const content = await store.createContent({ kind: 'writing', visibility: 'public', payload: { prompt: 'A real published prompt', references: ['A real reference'], source: 'Original test content' } });
  assert.equal((await body(await request('http://local/api/me/learning-summary'))).modules.writing, 0);
  await store.updateContentStatus(content.id, 1, 'published', 'test');
  assert.equal((await body(await request('http://local/api/me/learning-summary'))).modules.writing, 1);
  const output = await body(await request(`http://local/api/learning/output?kind=writing&content=${content.id}`));
  assert.equal(output.items[0].prompt, 'A real published prompt');
  await store.updateContentStatus(content.id, 1, 'withdrawn', 'test');
  assert.equal((await body(await request('http://local/api/me/learning-summary'))).modules.writing, 0);
});

test('question reference codec preserves both legacy arrays and frozen versions', () => {
  assert.deepEqual(decodeSelection('["legacy"]'), { questionIds: ['legacy'] });
  const selection = { questionIds: ['custom'], questionVersions: { custom: 3 } };
  assert.deepEqual(decodeSelection(encodeSelection(selection)), selection);
  assert.deepEqual(decodeSelection(JSON.parse(encodeSelection(selection))), selection);
});

async function authenticated(email = 'learner@example.com', store: StudyStore = new InMemoryStore(), role: UserRole = 'learner') {
  if (store instanceof InMemoryStore && !store.content.size) for (const item of legacyContent) store.content.set(item.id, [{ ...item, visibility: 'public', status: 'published', createdAt: new Date().toISOString() }]);
  const username = email.split('@')[0].replace(/[^a-z0-9_.-]/g, '-');
  if (!await store.findUserByEmail(email)) {
    await store.createPasswordUser({ username, email, nickname: username, role, passwordHash: await hashPassword(TEST_PASSWORD), mustChangePassword: false });
  }
  const app = createApp(store, { authOptions: { secureCookie: false } });
  const verified = await app.handle(new Request('http://local/api/auth/password/login', {
    method: 'POST', body: JSON.stringify({ identifier: email, password: TEST_PASSWORD }),
  }));
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const request = (url: string, init: RequestInit = {}) => app.handle(new Request(url, {
    ...init,
    headers: { cookie, ...init.headers },
  }));
  return { ...app, cookie, request };
}

test('health and plan expose stable server state', async () => {
  const { handle, request } = await authenticated();
  const health = await handle(new Request('http://local/health'));
  assert.equal(health.status, 200);
  assert.equal((await body(health)).status, 'ok');

  const plan = await request('http://local/api/me/plan');
  const planBody = await body(plan);
  assert.equal(plan.status, 200);
  assert.equal(planBody.timezone, 'Asia/Shanghai');
  assert.equal(planBody.tasks.length, 5);
});

test('CORS preflight returns the required headers without a response body', async () => {
  const { handle } = createApp();
  const response = await handle(new Request('http://local/api/study/sessions', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(await response.text(), '');
});

test('practice session never exposes answers before submission', async () => {
  const { request } = await authenticated();
  const response = await request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'new_words', mode: 'practice' }) });
  const responseBody = await body(response);
  assert.equal(response.status, 201);
  assert.equal(responseBody.session.questions.length, 5);
  assert.equal('correctIndex' in responseBody.session.questions[0], false);
  assert.equal('explanation' in responseBody.session.questions[0], false);
});

test('answer submission is idempotent and locks the first answer', async () => {
  const { request } = await authenticated();
  const created = await body(await request('http://local/api/study/sessions', { method: 'POST', body: '{}' }));
  const sessionId = created.session.id as string;
  const q = created.session.questions[0];
  const payload = { question_id: q.id, question_version: q.version, answer: questionById.get(q.id)!.correctIndex, idempotency_key: 'answer-001' };

  const first = await body(await request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify(payload) }));
  const repeated = await body(await request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify({ ...payload, answer: 0 }) }));
  const secondKey = await body(await request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify({ ...payload, answer: 0, idempotency_key: 'answer-002' }) }));

  assert.equal(first.accepted, true);
  assert.equal(first.feedback.correct, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(secondKey.duplicate, true);
  assert.equal(first.attempt_id, repeated.attempt_id);
  assert.equal(first.attempt_id, secondKey.attempt_id);
});

test('version mismatch is rejected with a stable error code', async () => {
  const { request } = await authenticated();
  const created = await body(await request('http://local/api/study/sessions', { method: 'POST', body: '{}' }));
  const response = await request(`http://local/api/sessions/${created.session.id}/answers`, {
    method: 'POST',
    body: JSON.stringify({ question_id: created.session.questions[0].id, question_version: 99, answer: 1, idempotency_key: 'version-test' }),
  });
  assert.equal(response.status, 409);
  assert.equal((await body(response)).error.code, 'QUESTION_VERSION_MISMATCH');
});

test('finishing a complete session awards daily points only once', async () => {
  const { request } = await authenticated();
  const created = await body(await request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'game' }) }));
  const sessionId = created.session.id as string;
  for (const [index, question] of created.session.questions.entries()) {
    await request(`http://local/api/sessions/${sessionId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: 0, idempotency_key: `finish-${index}` }),
    });
  }
  const first = await body(await request(`http://local/api/sessions/${sessionId}/finish`, { method: 'POST' }));
  const repeated = await body(await request(`http://local/api/sessions/${sessionId}/finish`, { method: 'POST' }));
  assert.equal(first.result.answered, 5);
  assert.equal(first.reward.awarded, true);
  assert.equal(repeated.reward.awarded, false);
});

test('password login keeps users isolated and supports logout', async () => {
  const first = await authenticated('first@example.com');
  const me = await first.request('http://local/api/me');
  assert.equal(me.status, 200);
  assert.equal((await body(me)).user.email, 'first@example.com');

  const created = await body(await first.request('http://local/api/study/sessions', { method: 'POST', body: '{}' }));
  const second = await authenticated('second@example.com', first.store);
  const forbidden = await second.request(`http://local/api/sessions/${created.session.id}`);
  assert.equal(forbidden.status, 404);

  const logout = await first.request('http://local/api/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await first.request('http://local/api/me');
  assert.equal(afterLogout.status, 401);
});

test('admin creates users, first login requires a password change, and reset revokes sessions', async () => {
  const store = new InMemoryStore();
  const admin = await authenticated('admin-auth@example.com', store, 'admin');
  const createdResponse = await admin.request('http://local/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username: 'pilot-user', email: 'pilot@example.com', nickname: '试用用户', role: 'learner', initial_password: 'Initial-pass-2026' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await body(createdResponse);
  assert.equal(created.user.mustChangePassword, true);

  const app = createApp(store, { authOptions: { secureCookie: false } });
  const login = await app.handle(new Request('http://local/api/auth/password/login', {
    method: 'POST', body: JSON.stringify({ identifier: 'pilot-user', password: 'Initial-pass-2026' }),
  }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const request = (url: string, init: RequestInit = {}) => app.handle(new Request(url, { ...init, headers: { cookie, ...init.headers } }));
  assert.equal((await request('http://local/api/me')).status, 200);
  const blocked = await request('http://local/api/me/plan');
  assert.equal(blocked.status, 403);
  assert.equal((await body(blocked)).error.code, 'PASSWORD_CHANGE_REQUIRED');

  const changed = await request('http://local/api/auth/password/change', {
    method: 'POST', body: JSON.stringify({ current_password: 'Initial-pass-2026', new_password: 'Personal-pass-2026' }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await body(changed)).user.mustChangePassword, false);
  assert.equal((await request('http://local/api/me/plan')).status, 200);

  const reset = await body(await admin.request(`http://local/api/admin/users/${created.user.id}/reset-password`, { method: 'POST', body: '{}' }));
  assert.ok(reset.temporary_password);
  assert.equal((await request('http://local/api/me')).status, 401);
  const oldLogin = await app.handle(new Request('http://local/api/auth/password/login', {
    method: 'POST', body: JSON.stringify({ identifier: 'pilot@example.com', password: 'Personal-pass-2026' }),
  }));
  assert.equal(oldLogin.status, 401);
  const resetLogin = await app.handle(new Request('http://local/api/auth/password/login', {
    method: 'POST', body: JSON.stringify({ identifier: 'pilot@example.com', password: reset.temporary_password }),
  }));
  assert.equal(resetLogin.status, 200);
  assert.equal((await body(resetLogin)).user.mustChangePassword, true);
});

test('learning loop exposes plan, reviews, collections, corrections and open output', async () => {
  const { request } = await authenticated('loop@example.com');
  const plan = await body(await request('http://local/api/me/plan'));
  assert.equal(plan.plan_tier, 'standard');
  assert.equal(plan.tasks.length, 5);

  const scheduled = await body(await request('http://local/api/me/plan', {
    method: 'PUT', body: JSON.stringify({ plan_tier: 'light', exam_date: '2026-12-20' }),
  }));
  assert.equal(scheduled.plan_tier, 'light');
  assert.ok(scheduled.effective_date > plan.server_date);

  const created = await body(await request('http://local/api/study/sessions', { method: 'POST', body: '{}' }));
  const question = created.session.questions[0];
  const correctIndex = questionById.get(question.id)!.correctIndex;
  const answer = await body(await request(`http://local/api/sessions/${created.session.id}/answers`, {
    method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: (correctIndex + 1) % question.options.length, idempotency_key: 'loop-answer' }),
  }));
  const correction = await request(`http://local/api/attempts/${answer.attempt_id}/corrections`, {
    method: 'POST', body: JSON.stringify({ answer: correctIndex, self_check: { meaning: true } }),
  });
  assert.equal(correction.status, 201);

  await request('http://local/api/collections', {
    method: 'POST', body: JSON.stringify({ content_item_id: question.id, content_version: question.version, kind: 'word', note: '重点复习' }),
  });
  const collections = await body(await request('http://local/api/collections?kind=word'));
  assert.equal(collections.items.length, 1);

  const outputOne = await body(await request('http://local/api/open-submissions', {
    method: 'POST', body: JSON.stringify({ module: 'translation', prompt_id: 'culture-1', response_text: 'Culture plays an important role.', self_check: { complete: true } }),
  }));
  assert.equal(outputOne.reward, null);
  const outputTwo = await body(await request('http://local/api/open-submissions', {
    method: 'POST', body: JSON.stringify({ module: 'writing', prompt_id: 'writing-1', response_text: 'One practical way is to read daily.', self_check: { complete: true } }),
  }));
  assert.equal(outputTwo.reward.awarded, true);
});

test('server-authoritative streak game computes bonuses and daily reward', async () => {
  const { request } = await authenticated('gamer@example.com');
  const created = await body(await request('http://local/api/games/sessions', {
    method: 'POST', body: JSON.stringify({ game_type: 'streak' }),
  }));
  for (const [index, question] of created.session.questions.entries()) {
    const result = await body(await request(`http://local/api/game-sessions/${created.session.id}/answers`, {
      method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: questionById.get(question.id)!.correctIndex, idempotency_key: `game-${index}` }),
    }));
    assert.equal(result.accepted, true);
  }
  const finished = await body(await request(`http://local/api/game-sessions/${created.session.id}/finish`, { method: 'POST' }));
  assert.equal(finished.result.correct, 10);
  assert.equal(finished.result.score, 115);
  assert.equal(finished.result.longest_streak, 10);
  assert.equal(finished.reward.awarded, true);
});

test('team invitations and asynchronous challenge allow one ranked participation', async () => {
  const owner = await authenticated('owner@example.com');
  const createdTeam = await body(await owner.request('http://local/api/teams', { method: 'POST', body: JSON.stringify({ name: '六级测试小队' }) }));

  const member = await authenticated('member@example.com', owner.store);
  const memberRequest = member.request;
  const joined = await memberRequest('http://local/api/teams/join', { method: 'POST', body: JSON.stringify({ invite_code: createdTeam.team.inviteCode }) });
  assert.equal(joined.status, 200);
  const teamOverview = await body(await owner.request('http://local/api/teams/me'));
  const memberId = teamOverview.overview.members.find((item: Record<string, unknown>) => item.nickname === 'member')?.userId;
  const encouraged = await owner.request(`http://local/api/teams/${createdTeam.team.id}/reactions`, { method: 'POST', body: JSON.stringify({ receiver_id: memberId, message_key: 'keep-going' }) });
  assert.equal(encouraged.status, 201);

  const challenge = await body(await owner.request('http://local/api/challenges', { method: 'POST', body: JSON.stringify({ game_type: 'root-chain', title: '周末词根挑战' }) }));
  const started = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/start`, { method: 'POST' }));
  assert.equal(started.duplicate, false);
  for (const [index, question] of started.session.questions.entries()) {
    const response = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/answers`, {
      method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: questionById.get(question.id)!.correctIndex, idempotency_key: `challenge-${index}` }),
    }));
    assert.equal(response.feedback, null);
  }
  const finished = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/finish`, { method: 'POST' }));
  assert.equal(finished.revealed, false);
  const repeated = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/start`, { method: 'POST' }));
  assert.equal(repeated.duplicate, true);
});

test('private uploads validate signatures and stay isolated by owner', async () => {
  process.env.UPLOAD_DRIVER = 'local';
  process.env.LOCAL_UPLOAD_DIR = '/private/tmp/cet6-buddy-test-uploads';
  const owner = await authenticated('upload-owner@example.com');
  const form = new FormData();
  form.set('file', new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'note.png', { type: 'image/png' }));
  const uploaded = await owner.request('http://local/api/uploads', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const uploadedBody = await body(uploaded);
  assert.equal(uploadedBody.asset.visibility, 'private');
  assert.equal(uploadedBody.import.status, 'uploaded');
  const downloaded = await owner.request(`http://local/api/assets/${uploadedBody.asset.id}/download`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');

  const other = await authenticated('upload-other@example.com', owner.store);
  const otherImports = await body(await other.request('http://local/api/imports'));
  assert.equal(otherImports.imports.length, 0);
  const forbiddenDownload = await other.request(`http://local/api/assets/${uploadedBody.asset.id}/download`);
  assert.equal(forbiddenDownload.status, 404);
});

test('admin content publishing enforces role and required fields', async () => {
  const store = new InMemoryStore();
  const learner = await authenticated('ordinary@example.com', store);
  const denied = await learner.request('http://local/api/admin/content');
  assert.equal(denied.status, 403);

  const admin = await authenticated('admin@example.com', store, 'admin');
  const adminRequest = admin.request;
  const incomplete = await body(await adminRequest('http://local/api/admin/content', { method: 'POST', body: JSON.stringify({ kind: 'word', payload: { word: 'incomplete' } }) }));
  const rejected = await adminRequest(`http://local/api/admin/content/${incomplete.content.id}/publish`, { method: 'POST', body: '{}' });
  assert.equal(rejected.status, 422);
  assert.equal((await body(rejected)).error.code, 'CONTENT_VALIDATION_FAILED');

  const valid = await body(await adminRequest('http://local/api/admin/content', { method: 'POST', body: JSON.stringify({ kind: 'word', payload: { ...legacyContent[0].payload, word: 'coherent', meaning: '连贯的' } }) }));
  const published = await body(await adminRequest(`http://local/api/admin/content/${valid.content.id}/publish`, { method: 'POST', body: '{}' }));
  assert.equal(published.content.status, 'published');
});

test('server point ledger enforces the 45 point Shanghai-day cap', async () => {
  const store = new InMemoryStore();
  const user = await store.createUser('cap@example.com', 'cap');
  for (let index = 0; index < 5; index += 1) await store.awardPoints(user.id, `cap-${index}`, 10, 'test');
  const points = [...store.pointLedger.values()].filter(item => item.userId === user.id).reduce((sum, item) => sum + item.points, 0);
  assert.equal(points, 45);
  const rejected = await store.awardPoints(user.id, 'cap-extra', 5, 'test');
  assert.equal(rejected.awarded, false);
});

test('checkin is server-gated by all required daily tasks', async () => {
  const session = await authenticated('checkin@example.com');
  const tooEarly = await session.request('http://local/api/me/checkin', { method: 'POST', body: '{}' });
  assert.equal(tooEarly.status, 422);
  const me = (await body(await session.request('http://local/api/me'))).user;
  const date = (await body(await session.request('http://local/api/me/plan'))).server_date;
  const tasks = await session.store.getDailyTasks(me.id, date, 'standard');
  for (const task of tasks.filter(item => item.required)) await session.store.incrementDailyTask(me.id, date, task.key, task.target, 'standard');
  const checked = await body(await session.request('http://local/api/me/checkin', { method: 'POST', body: '{}' }));
  assert.equal(checked.checkin.checkinDate, date);
  const repeated = await body(await session.request('http://local/api/me/checkin', { method: 'POST', body: '{}' }));
  assert.equal(repeated.checkin.id, checked.checkin.id);
});

test('listening and reading use persisted first-answer sessions and input review skills', async () => {
  const session = await authenticated('input@example.com');
  for (const source of ['listening', 'reading'] as const) {
    const created = await body(await session.request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source, mode: 'practice' }) }));
    assert.equal(created.session.questions.length, 1);
    const question = created.session.questions[0];
    const answer = await body(await session.request(`http://local/api/sessions/${created.session.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: 1, idempotency_key: `${source}-first` }) }));
    assert.equal(answer.feedback.correct, true);
    await session.request(`http://local/api/sessions/${created.session.id}/finish`, { method: 'POST', body: '{}' });
  }
  const reviews = await body(await session.request('http://local/api/me/reviews?due_before=2099-01-01T00:00:00.000Z'));
  assert.ok(reviews.reviews.some((item: Record<string, unknown>) => item.skill === 'listening'));
  assert.ok(reviews.reviews.some((item: Record<string, unknown>) => item.skill === 'reading'));
});

test('spelling attempts are stored separately and update the spelling review queue', async () => {
  const session = await authenticated('spelling@example.com');
  const first = await body(await session.request('http://local/api/spelling-attempts', { method: 'POST', body: JSON.stringify({ content_item_id: 'w-sustainable', content_version: 1, answer_text: 'sustanable', idempotency_key: 'spell-1' }) }));
  assert.equal(first.feedback.correct, false);
  const repeated = await body(await session.request('http://local/api/spelling-attempts', { method: 'POST', body: JSON.stringify({ content_item_id: 'w-sustainable', content_version: 1, answer_text: 'sustainable', idempotency_key: 'spell-1' }) }));
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.feedback.correct, false);
  const reviews = await body(await session.request('http://local/api/me/reviews?due_before=2099-01-01T00:00:00.000Z'));
  assert.ok(reviews.reviews.some((item: Record<string, unknown>) => item.skill === 'spelling'));
});

test('published database content drives sessions; drafts, private content and withdrawals stay isolated', async () => {
  const store = new InMemoryStore();
  const admin = await authenticated('bank-admin@example.com', store, 'admin');
  const learner = await authenticated('bank-learner@example.com', store);
  store.content.clear();
  const create = (visibility = 'public') => admin.request('http://local/api/admin/content', { method: 'POST', body: JSON.stringify({ kind: 'word', visibility, payload: { ...legacyContent[0].payload, word: 'database-only' } }) });
  const record = (await body(await create())).content;
  const start = () => learner.request('http://local/api/study/sessions', { method: 'POST', body: '{}' });
  assert.equal((await start()).status, 409); // no static fallback
  assert.equal((await admin.request(`http://local/api/admin/content/${record.id}/publish`, { method: 'POST', body: '{}' })).status, 200);
  const started = (await body(await start())).session;
  assert.equal(started.questions[0].word, 'database-only');
  assert.equal(started.questions[0].id, record.id);
  assert.equal(started.questions[0].correctIndex, undefined);
  assert.equal(started.questions[0].meaning, undefined);
  const privateRecord = (await body(await create('private'))).content;
  await admin.request(`http://local/api/admin/content/${privateRecord.id}/publish`, { method: 'POST', body: '{}' });
  assert.equal((await body(await start())).session.questions.length, 1);
  const newPayload = { ...record.payload, word: 'database-v2', correct_index: 0 };
  await admin.request(`http://local/api/admin/content/${record.id}/versions`, { method: 'POST', body: JSON.stringify({ payload: newPayload }) });
  assert.equal((await body(await start())).session.questions[0].version, 1); // draft does not shadow published v1
  await admin.request(`http://local/api/admin/content/${record.id}/publish`, { method: 'POST', body: '{}' });
  assert.equal((await body(await start())).session.questions[0].version, 2);
  await admin.request(`http://local/api/admin/content/${record.id}/withdraw`, { method: 'POST', body: '{}' });
  assert.equal((await start()).status, 409); // cannot resurrect v1
  const resume = await body(await learner.request(`http://local/api/sessions/${started.id}/resume`));
  assert.equal(resume.session.questions[0].word, 'database-only');
  const answered = await body(await learner.request(`http://local/api/sessions/${started.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: record.id, question_version: 1, answer: 1, idempotency_key: 'frozen-answer' }) }));
  assert.equal(answered.feedback.correct, true);
  assert.equal((await admin.request(`http://local/api/sessions/${started.id}/resume`)).status, 404);
  const bank = await body(await learner.request('http://local/api/question-bank'));
  assert.equal(bank.items.length, 0);
});

test('challenge freezes only public question versions before participants start', async () => {
  const store = new InMemoryStore();
  const owner = await authenticated('freeze-owner@example.com', store);
  const team = (await body(await owner.request('http://local/api/teams', { method: 'POST', body: JSON.stringify({ name: 'Freeze team' }) }))).team;
  const member = await authenticated('freeze-member@example.com', store);
  await member.request('http://local/api/teams/join', { method: 'POST', body: JSON.stringify({ invite_code: team.inviteCode }) });
  const challenge = (await body(await owner.request('http://local/api/challenges', { method: 'POST', body: JSON.stringify({ game_type: 'streak' }) }))).challenge;
  for (const item of await store.listContent()) await store.updateContentStatus(item.id, item.version, 'withdrawn', team.ownerId);
  const started = await body(await member.request(`http://local/api/challenges/${challenge.id}/start`, { method: 'POST' }));
  assert.equal(started.session.questions.length, 10);
  assert.deepEqual(started.session.questionVersions, challenge.questionVersions);
  assert.equal(JSON.stringify(started).includes('correctIndex'), false);
  const q = started.session.questions[0];
  const result = await body(await member.request(`http://local/api/challenges/${challenge.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: q.id, question_version: q.version, answer: 1, idempotency_key: 'frozen-challenge' }) }));
  assert.equal(result.accepted, true);
  assert.equal(result.feedback, null);
  assert.equal((await owner.request('http://local/api/games/sessions', { method: 'POST', body: JSON.stringify({ game_type: 'flash' }) })).status, 409);
});

test('publication rejects malformed answer keys and reading groups produce real passages and multiple questions', async () => {
  const store = new InMemoryStore();
  const admin = await authenticated('group-admin@example.com', store, 'admin');
  const invalid = await store.createContent({ kind: 'word', visibility: 'public', payload: { ...legacyContent[0].payload, correct_index: 9 } });
  assert.equal((await admin.request(`http://local/api/admin/content/${invalid.id}/publish`, { method: 'POST', body: '{}' })).status, 422);
  const reading = await store.createContent({ kind: 'reading', visibility: 'public', payload: { title: 'Database passage', passage: 'This passage came from the content record.', source: 'Test fixture', questions: [0, 1].map(index => ({ prompt: `Question ${index}`, options: ['one', 'two'], correct_index: index, explanation: 'Test explanation' })) } });
  await admin.request(`http://local/api/admin/content/${reading.id}/publish`, { method: 'POST', body: '{}' });
  const created = (await body(await admin.request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'reading', content_item_id: reading.id }) }))).session;
  assert.equal(created.questions.length, 2);
  assert.equal(created.questions[0].passage, reading.payload.passage);
  for (const [index, q] of created.questions.entries()) {
    const answer = await body(await admin.request(`http://local/api/sessions/${created.id}/answers`, { method: 'POST', body: JSON.stringify({ question_id: q.id, question_version: q.version, answer: index, idempotency_key: `group-${index}` }) }));
    assert.equal(answer.feedback.correct, true);
  }
  assert.equal((await admin.request(`http://local/api/sessions/${created.id}/finish`, { method: 'POST' })).status, 200);
  assert.ok([...store.reviews.values()].some(review => review.contentItemId === reading.id));
  assert.ok([...store.reviews.values()].every(review => !review.contentItemId.includes(':')));
});

test('due reviews select only due published words and do not silently fall back to new words', async () => {
  const store = new InMemoryStore();
  const learner = await authenticated('due-bank@example.com', store);
  const user = (await body(await learner.request('http://local/api/me'))).user;
  const start = () => learner.request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'due_reviews' }) });
  assert.equal((await start()).status, 409);
  await store.updateReviewState(user.id, 'w-sustainable', 'meaning', false, '2020-01-01T00:00:00.000Z');
  const session = (await body(await start())).session;
  assert.deepEqual(session.questionIds, ['w-sustainable']);
  await store.updateContentStatus('w-sustainable', 1, 'withdrawn');
  assert.equal((await start()).status, 409);
});

test('pre-upgrade array sessions still resume with their original demonstration questions', async () => {
  const store = new InMemoryStore();
  const learner = await authenticated('legacy-bank@example.com', store);
  const user = (await body(await learner.request('http://local/api/me'))).user;
  const old = await store.createSession({ userId: user.id, source: 'new_words', mode: 'practice', questionIds: ['w-sustainable'] });
  store.content.clear();
  const resumed = await body(await learner.request(`http://local/api/sessions/${old.id}/resume`));
  assert.equal(resumed.session.questions[0].version, 1);
  assert.equal(resumed.session.questions[0].correctIndex, undefined);
  assert.equal((await learner.request('http://local/api/study/sessions', { method: 'POST', body: '{}' })).status, 409);
});
