import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.ts';
import { MemoryEmailSender } from './email.ts';
import { InMemoryStore } from './store.ts';

async function body(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function authenticated(email = 'learner@example.com') {
  const sender = new MemoryEmailSender();
  const app = createApp(new InMemoryStore(), {
    emailSender: sender,
    authOptions: { codeSecret: 'test-secret-with-enough-entropy', secureCookie: false, exposeCode: false },
  });
  const requested = await app.handle(new Request('http://local/api/auth/email/request', {
    method: 'POST', body: JSON.stringify({ email }),
  }));
  assert.equal(requested.status, 202);
  const code = sender.codes.get(email);
  assert.ok(code);
  const verified = await app.handle(new Request('http://local/api/auth/email/verify', {
    method: 'POST', body: JSON.stringify({ email, code }),
  }));
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const request = (url: string, init: RequestInit = {}) => app.handle(new Request(url, {
    ...init,
    headers: { cookie, ...init.headers },
  }));
  return { ...app, cookie, request, sender };
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
  const response = await request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'due_reviews', mode: 'practice' }) });
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
  const payload = { question_id: 'w-sustainable', question_version: 1, answer: 1, idempotency_key: 'answer-001' };

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
    body: JSON.stringify({ question_id: 'w-sustainable', question_version: 99, answer: 1, idempotency_key: 'version-test' }),
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

test('email login creates isolated users and supports logout', async () => {
  const first = await authenticated('first@example.com');
  const me = await first.request('http://local/api/me');
  assert.equal(me.status, 200);
  assert.equal((await body(me)).user.email, 'first@example.com');

  const created = await body(await first.request('http://local/api/study/sessions', { method: 'POST', body: '{}' }));
  const secondSender = new MemoryEmailSender();
  const secondApp = createApp(first.store, {
    emailSender: secondSender,
    authOptions: { codeSecret: 'test-secret-with-enough-entropy', secureCookie: false, exposeCode: false },
  });
  await secondApp.handle(new Request('http://local/api/auth/email/request', { method: 'POST', body: JSON.stringify({ email: 'second@example.com' }) }));
  const secondCode = secondSender.codes.get('second@example.com');
  const secondLogin = await secondApp.handle(new Request('http://local/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email: 'second@example.com', code: secondCode }) }));
  const secondCookie = secondLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
  const forbidden = await secondApp.handle(new Request(`http://local/api/sessions/${created.session.id}`, { headers: { cookie: secondCookie } }));
  assert.equal(forbidden.status, 404);

  const logout = await first.request('http://local/api/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await first.request('http://local/api/me');
  assert.equal(afterLogout.status, 401);
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
  const answer = await body(await request(`http://local/api/sessions/${created.session.id}/answers`, {
    method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: 0, idempotency_key: 'loop-answer' }),
  }));
  const correction = await request(`http://local/api/attempts/${answer.attempt_id}/corrections`, {
    method: 'POST', body: JSON.stringify({ answer: 1, self_check: { meaning: true } }),
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
  const answers = [1, 0, 1, 1, 1, 0, 2, 0, 1, 2];
  for (const [index, question] of created.session.questions.entries()) {
    const result = await body(await request(`http://local/api/game-sessions/${created.session.id}/answers`, {
      method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: answers[index], idempotency_key: `game-${index}` }),
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

  const memberSender = new MemoryEmailSender();
  const memberApp = createApp(owner.store, { emailSender: memberSender, authOptions: { codeSecret: 'test-secret-with-enough-entropy', secureCookie: false, exposeCode: false } });
  await memberApp.handle(new Request('http://local/api/auth/email/request', { method: 'POST', body: JSON.stringify({ email: 'member@example.com' }) }));
  const code = memberSender.codes.get('member@example.com');
  const login = await memberApp.handle(new Request('http://local/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email: 'member@example.com', code }) }));
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const memberRequest = (url: string, init: RequestInit = {}) => memberApp.handle(new Request(url, { ...init, headers: { cookie, ...init.headers } }));
  const joined = await memberRequest('http://local/api/teams/join', { method: 'POST', body: JSON.stringify({ invite_code: createdTeam.team.inviteCode }) });
  assert.equal(joined.status, 200);

  const challenge = await body(await owner.request('http://local/api/challenges', { method: 'POST', body: JSON.stringify({ game_type: 'root-chain', title: '周末词根挑战' }) }));
  const started = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/start`, { method: 'POST' }));
  assert.equal(started.duplicate, false);
  const answers = [1, 0, 1, 1, 1];
  for (const [index, question] of started.session.questions.entries()) {
    const response = await body(await memberRequest(`http://local/api/challenges/${challenge.challenge.id}/answers`, {
      method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: answers[index], idempotency_key: `challenge-${index}` }),
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

  const otherSender = new MemoryEmailSender();
  const otherApp = createApp(owner.store, { emailSender: otherSender, authOptions: { codeSecret: 'test-secret-with-enough-entropy', secureCookie: false, exposeCode: false } });
  await otherApp.handle(new Request('http://local/api/auth/email/request', { method: 'POST', body: JSON.stringify({ email: 'upload-other@example.com' }) }));
  const otherLogin = await otherApp.handle(new Request('http://local/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email: 'upload-other@example.com', code: otherSender.codes.get('upload-other@example.com') }) }));
  const otherCookie = otherLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
  const otherImports = await body(await otherApp.handle(new Request('http://local/api/imports', { headers: { cookie: otherCookie } })));
  assert.equal(otherImports.imports.length, 0);
  const forbiddenDownload = await otherApp.handle(new Request(`http://local/api/assets/${uploadedBody.asset.id}/download`, { headers: { cookie: otherCookie } }));
  assert.equal(forbiddenDownload.status, 404);
});

test('admin content publishing enforces role and required fields', async () => {
  const sender = new MemoryEmailSender();
  const app = createApp(new InMemoryStore(), {
    emailSender: sender,
    authOptions: { codeSecret: 'test-secret-with-enough-entropy', secureCookie: false, exposeCode: false, adminEmails: ['admin@example.com'] },
  });
  async function login(email: string) {
    await app.handle(new Request('http://local/api/auth/email/request', { method: 'POST', body: JSON.stringify({ email }) }));
    const response = await app.handle(new Request('http://local/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email, code: sender.codes.get(email) }) }));
    return response.headers.get('set-cookie')?.split(';')[0] ?? '';
  }
  const learnerCookie = await login('ordinary@example.com');
  const denied = await app.handle(new Request('http://local/api/admin/content', { headers: { cookie: learnerCookie } }));
  assert.equal(denied.status, 403);

  const adminCookie = await login('admin@example.com');
  const adminRequest = (url: string, init: RequestInit = {}) => app.handle(new Request(url, { ...init, headers: { cookie: adminCookie, ...init.headers } }));
  const incomplete = await body(await adminRequest('http://local/api/admin/content', { method: 'POST', body: JSON.stringify({ kind: 'word', payload: { word: 'incomplete' } }) }));
  const rejected = await adminRequest(`http://local/api/admin/content/${incomplete.content.id}/publish`, { method: 'POST', body: '{}' });
  assert.equal(rejected.status, 422);
  assert.equal((await body(rejected)).error.code, 'CONTENT_VALIDATION_FAILED');

  const valid = await body(await adminRequest('http://local/api/admin/content', { method: 'POST', body: JSON.stringify({ kind: 'word', payload: { word: 'coherent', meaning: '连贯的' } }) }));
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
