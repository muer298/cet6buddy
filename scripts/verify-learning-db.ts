import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createMysqlPool } from '../server/database.ts';
import { MysqlStore } from '../server/mysql-store.ts';

// Exercise current SQL against the configured DB, but roll back EVERY fixture write.
// No DDL, no production account login, no changes to existing users or their history.
const pool = createMysqlPool();
const connection = await pool.getConnection();
let userId: string | undefined;
try {
  await connection.beginTransaction();
  const nested = new Proxy(connection, { get(target, key) {
    if (['beginTransaction', 'commit', 'rollback', 'release'].includes(String(key))) return async () => {};
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const store = new MysqlStore({ execute: connection.execute.bind(connection), query: connection.query.bind(connection), getConnection: async () => nested } as unknown as Pool);
  const name = `verify-${randomUUID().slice(0, 8)}`;
  const user = await store.createPasswordUser({ username: name, email: `${name}@test.invalid`, nickname: name, role: 'learner', passwordHash: 'unusable-test-hash', mustChangePassword: true });
  userId = user.id;
  const c = await store.createContent({ kind: 'word', ownerId: user.id, visibility: 'private', payload: { word: 'verify', meaning: '验证', prompt: 'Verification only', options: ['验证', '其他'], correct_index: 0, explanation: 'Test', source: 'Rollback-only fixture' } });
  await store.updateContentStatus(c.id, 1, 'published', user.id);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal((await store.getDailyTasks(user.id, date, 'standard')).find(t => t.key === 'review')!.target, 0);
  await store.updateReviewState(user.id, c.id, 'spelling', false, '2020-01-01T00:00:00Z');
  await store.atomic(user.id, async () => {
    await store.incrementDailyTask(user.id, date, 'review', 1, 'standard');
    await store.updateReviewState(user.id, c.id, 'spelling', true, new Date().toISOString());
    const review = (await store.getDailyTasks(user.id, date, 'standard')).find(t => t.key === 'review')!;
    assert.equal(review.completed, 1); assert.equal(review.target, 1);
    assert.equal((await store.awardPoints(user.id, `${user.id}:review:${date}`, 10, 'Rollback-only verification')).awarded, true);
    assert.equal((await store.awardPoints(user.id, `${user.id}:review:${date}`, 10, 'Rollback-only verification')).awarded, false);
    const input = { userId: user.id, module: 'translation' as const, promptId: c.id, responseText: 'Rollback-only response.', selfCheck: {} };
    const first = await store.saveOpenSubmission(input);
    const retry = await store.saveOpenSubmission(input);
    assert.equal(first.id, retry.id); assert.equal(retry.duplicate, true);
  });
  console.log('PASS: configured MySQL supports transactional review targets, review credit, ledger deduplication and output deduplication.');
} finally {
  await connection.rollback();
  connection.release();
  if (userId) {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE id = ?', [userId]);
    assert.equal(rows.length, 0, 'Fixture transaction must have been rolled back');
    console.log('PASS: all verification fixture writes rolled back; no persisted test account or learning records.');
  }
  await pool.end();
}
