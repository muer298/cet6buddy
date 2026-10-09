import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createStoreFromEnv } from '../server/store-factory.ts';
import { createMysqlPool } from '../server/database.ts';
import { hashPassword } from '../server/auth.ts';
import { legacyContent } from '../server/legacy-content.ts';

// Explicit deployment smoke test. Only creates private test content; retains audit/history.
const runtime = await createStoreFromEnv();
const origin = process.env.CORS_ORIGIN!;
assert.ok(origin?.startsWith('https://'), 'HTTPS origin required');
const users: string[] = [];
const records: string[] = [];
let auditActor = '';
let browserCredentialsHandedOff = false;
async function account(role: 'admin' | 'learner') {
  const username = `bank-${Date.now()}-${role}`;
  const password = `C6-${randomBytes(20).toString('base64url')}9a`;
  const user = await runtime.store.createPasswordUser({ username, email: `${username}@cet6.local`, nickname: '题库部署验证（完成后停用）', role, passwordHash: await hashPassword(password), mustChangePassword: false });
  users.push(user.id);
  if (role === 'admin') auditActor = user.id;
  const login = await fetch(`${origin}/api/auth/password/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ identifier: username, password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!;
  assert.ok(cookie.includes('Secure') && cookie.includes('HttpOnly'));
  const request = async (path: string, method = 'GET', payload?: unknown) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { cookie: cookie.split(';')[0], origin, 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return { status: response.status, body: await response.json() as any };
  };
  return { user, username, password, request };
}
try {
  const admin = await account('admin');
  const learner = await account('learner');
  assert.equal((await learner.request('/api/admin/content')).status, 403);
  const created = await admin.request('/api/admin/content', 'POST', { kind: 'word', visibility: 'private', payload: { ...legacyContent[0].payload, word: 'cloud-database-fixture', source: '私有部署测试，不进入公共题库' } });
  assert.equal(created.status, 201);
  const item = created.body.content;
  records.push(item.id);
  assert.equal((await admin.request(`/api/admin/content/${item.id}/publish`, 'POST', {})).status, 200);
  const newSession = () => admin.request('/api/study/sessions', 'POST', { source: 'new_words', content_item_id: item.id });
  const started = await newSession();
  assert.equal(started.status, 201);
  const session = started.body.session;
  assert.equal(session.questions.length, 1);
  assert.equal(session.questions[0].word, 'cloud-database-fixture');
  assert.equal(session.questions[0].correctIndex, undefined);
  assert.equal((await learner.request('/api/study/sessions', 'POST', { source: 'new_words', content_item_id: item.id })).status, 409);
  const v2 = await admin.request(`/api/admin/content/${item.id}/versions`, 'POST', { payload: { ...item.payload, word: 'cloud-fixture-v2', correct_index: 0 } });
  assert.equal(v2.status, 201);
  assert.equal((await newSession()).body.session.questions[0].version, 1);
  assert.equal((await admin.request(`/api/admin/content/${item.id}/publish`, 'POST', {})).status, 200);
  assert.equal((await newSession()).body.session.questions[0].version, 2);
  const persisted = await runtime.store.getSession(session.id);
  assert.equal(persisted?.questionVersions?.[item.id], 1);
  const answer = await admin.request(`/api/sessions/${session.id}/answers`, 'POST', { question_id: item.id, question_version: 1, answer: 1, idempotency_key: `${session.id}:answer` });
  assert.equal(answer.body.feedback.correct, true);
  assert.equal((await admin.request(`/api/sessions/${session.id}/finish`, 'POST', {})).status, 200);
  assert.equal((await admin.request(`/api/admin/content/${item.id}/withdraw`, 'POST', {})).status, 200);
  assert.equal((await newSession()).status, 409);
  assert.equal((await admin.request(`/api/sessions/${session.id}/resume`)).body.session.questions[0].word, 'cloud-database-fixture');
  const game = await learner.request('/api/games/sessions', 'POST', { game_type: 'streak' });
  assert.equal(game.status, 201);
  assert.equal(game.body.session.questions.length, 10);
  assert.deepEqual((await runtime.store.getGameSession(game.body.session.id))?.questionVersions, game.body.session.questionVersions);
  for (const source of ['listening', 'reading']) {
    const input = await learner.request('/api/study/sessions', 'POST', { source });
    assert.equal(input.status, 201);
    assert.ok(input.body.session.questions[0][source === 'reading' ? 'passage' : 'audioUrl']);
  }
  const bank = await learner.request('/api/question-bank?kind=word');
  console.log(JSON.stringify({ result: 'PASS', publishedPublicWords: bank.body.pagination.total, checks: ['real MySQL persistence', 'private visibility', 'draft does not shadow published', 'version freeze', 'withdrawal', 'server grading', 'review FK', 'game versions', 'reading and listening', 'secure cookies'] }));
  // Optional private credential handoff for a subsequent isolated browser check. Never logs the password.
  if (process.env.BANK_BROWSER_CREDENTIAL_FILE) {
    await writeFile(process.env.BANK_BROWSER_CREDENTIAL_FILE, JSON.stringify({ identifier: admin.username, password: admin.password, userIds: users }), { mode: 0o600 });
    browserCredentialsHandedOff = true;
  }
} finally {
  for (const id of records) {
    const item = (await runtime.store.listContent()).find(item => item.id === id);
    if (item) await runtime.store.updateContentStatus(id, item.version, 'withdrawn', auditActor, '私有题库部署测试结束');
  }
  if (!browserCredentialsHandedOff) {
    const pool = createMysqlPool();
    try { for (const id of users) { await runtime.store.revokeUserSessions(id, new Date().toISOString()); await pool.execute("UPDATE users SET status = 'disabled' WHERE id = ?", [id]); } }
    finally { await pool.end(); }
  }
  await runtime.store.close?.();
}
