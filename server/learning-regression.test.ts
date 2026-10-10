import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { InMemoryStore, type StudyStore } from './store.ts';
import { MysqlStore } from './mysql-store.ts';
import { createMysqlPool } from './database.ts';

async function fixture(t: TestContext) {
  const store: StudyStore = process.env.CET6_TEST_MYSQL === '1' ? new MysqlStore(createMysqlPool()) : new InMemoryStore();
  t.after(() => store.close?.());
  const username = `test-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const user = await store.createPasswordUser({ username, email: `${username}@test.invalid`, nickname: username, role: 'learner', passwordHash: await hashPassword(password), mustChangePassword: false });
  const words = [];
  for (let i = 0; i < 10; i++) {
    const word = await store.createContent({ kind: 'word', ownerId: user.id, visibility: 'private', payload: { word: `word-${i}`, meaning: 'Correct', prompt: 'Choose', options: ['Correct', 'Wrong'], correct_index: 0, explanation: 'Correct', source: 'Regression fixture' } });
    await store.updateContentStatus(word.id, 1, 'published', user.id);
    words.push(word);
  }
  const app = createApp(store, { authOptions: { secureCookie: false } });
  const login = await app.handle(new Request('http://local/api/auth/password/login', { method: 'POST', body: JSON.stringify({ identifier: username, password }) }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const call = async (path: string, payload?: unknown) => {
    const response = await app.handle(new Request(`http://local/api${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { cookie }, body: payload === undefined ? undefined : JSON.stringify(payload) }));
    return { status: response.status, body: await response.json() as any };
  };
  const start = async (source = 'new_words', content?: string) => {
    const result = await call('/study/sessions', { source, content_item_id: content });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.session;
  };
  const answer = async (session: any, count = session.questions.length) => {
    for (const q of session.questions.slice(0, count)) assert.equal((await call(`/sessions/${session.id}/answers`, { question_id: q.id, question_version: q.version, answer: 0, idempotency_key: `${session.id}:${q.id}` })).status, 200);
  };
  const plan = async () => (await call('/me/plan')).body;
  return { store, user, words, call, start, answer, plan };
}

test('concurrent and overlapping finishes credit unique words and reviews exactly once', async t => {
  const f = await fixture(t);
  const a = await f.start('new_words', f.words[0].id);
  const b = await f.start('new_words', f.words[0].id);
  await f.answer(a); await f.answer(b);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.call(`/sessions/${a.id}/finish`, {})));
  assert.ok(results.every(r => r.status === 200));
  assert.equal(results.filter(r => !r.body.duplicate).length, 1);
  assert.equal((await f.store.listReviews(f.user.id, '2037-01-01T00:00:00Z'))[0].intervalDays, 1);
  await f.call(`/sessions/${b.id}/finish`, {});
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'new_words').completed, 1);
});

test('new-word rounds do not resample practiced words', async t => {
  const f = await fixture(t);
  const first = await f.start(); await f.answer(first); await f.call(`/sessions/${first.id}/finish`, {});
  const second = await f.start(); await f.answer(second); await f.call(`/sessions/${second.id}/finish`, {});
  assert.equal(new Set([...first.questions, ...second.questions].map(q => q.id)).size, 10);
  const summary = (await f.call('/me/learning-summary')).body;
  assert.equal(summary.practicedWords, 10);
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'new_words').completed, 10);
  assert.equal(summary.todayPoints, 10);
});

test('partial reading cannot settle or update tasks and reviews', async t => {
  const f = await fixture(t);
  const c = await f.store.createContent({ kind: 'reading', ownerId: f.user.id, visibility: 'private', payload: { title: 'Test', passage: 'Test passage', source: 'Original', questions: [1, 2].map(i => ({ prompt: `Question ${i}`, options: ['Yes', 'No'], correct_index: 0, explanation: 'Yes' })) } });
  await f.store.updateContentStatus(c.id, 1, 'published', f.user.id);
  const session = await f.start('reading', c.id); await f.answer(session, 1);
  assert.equal((await f.call(`/sessions/${session.id}/finish`, {})).status, 422);
  assert.equal((await f.store.getSession(session.id))!.status, 'active');
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'input').completed, 0);
  assert.equal((await f.store.listReviews(f.user.id, '2037-01-01T00:00:00Z')).length, 0);
  assert.equal((await f.call('/me/tasks/input/complete', {})).status, 410);
  assert.equal((await f.call(`/reviews/${c.id}/complete`, { skill: 'reading', correct: true })).status, 410);
  assert.equal((await f.plan()).earned_points, 0);
});

test('concurrent output retries save one work and one progress credit', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.call('/open-submissions', { module: 'translation', prompt_id: 'test-prompt', response_text: 'One original response.', self_check: {} })));
  assert.equal(new Set(results.map(r => r.body.submission.id)).size, 1);
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'output').completed, 1);
  assert.equal((await f.plan()).earned_points, 0);
});

test('spelling and meaning reviews are separate, credited once, and award once', async t => {
  const f = await fixture(t);
  for (const skill of ['meaning', 'spelling'] as const) await f.store.updateReviewState(f.user.id, f.words[0].id, skill, false, '2020-01-01T00:00:00Z');
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'review').target, 2);
  const spelling = { content_item_id: f.words[0].id, content_version: 1, answer_text: 'word-0', idempotency_key: randomUUID() };
  await Promise.all([f.call('/spelling-attempts', spelling), f.call('/spelling-attempts', spelling)]);
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'review').completed, 1);
  const s = await f.start('due_reviews', f.words[0].id); await f.answer(s); await f.call(`/sessions/${s.id}/finish`, {});
  const plan = await f.plan();
  assert.equal(plan.tasks.find((t: any) => t.key === 'review').completed, 2);
  assert.equal(plan.tasks.find((t: any) => t.key === 'review').target, 2);
  assert.equal(plan.earned_points, 10);
});

test('zero due reviews do not block check-in or grant free review points', async t => {
  const f = await fixture(t); const plan = await f.plan();
  assert.equal(plan.tasks.find((t: any) => t.key === 'review').target, 0);
  for (const task of plan.tasks.filter((t: any) => t.key !== 'review')) await f.store.incrementDailyTask(f.user.id, plan.server_date, task.key, task.target, 'standard');
  assert.equal((await f.call('/me/checkin', {})).status, 201);
  assert.equal((await f.plan()).earned_points, 0);
});

test('failed settlement rolls back review, progress, ledger and status then retries safely', async t => {
  const f = await fixture(t); const before = await f.plan();
  await f.store.incrementDailyTask(f.user.id, before.server_date, 'new_words', 5, 'standard');
  const session = await f.start(); await f.answer(session);
  const original = f.store.awardPoints.bind(f.store);
  f.store.awardPoints = async (...args) => { await original(...args); throw new Error('EXPECTED regression transaction failure'); };
  assert.equal((await f.call(`/sessions/${session.id}/finish`, {})).status, 500);
  f.store.awardPoints = original;
  assert.equal((await f.store.getSession(session.id))!.status, 'active');
  assert.equal((await f.store.listReviews(f.user.id, '2037-01-01T00:00:00Z')).length, 0);
  assert.equal((await f.plan()).tasks.find((t: any) => t.key === 'new_words').completed, 5);
  assert.equal((await f.plan()).earned_points, 0);
  assert.equal((await f.call(`/sessions/${session.id}/finish`, {})).status, 200);
  assert.equal((await f.plan()).earned_points, 10);
});
