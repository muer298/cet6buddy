import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStoreFromEnv } from '../server/store-factory.ts';
import { createMysqlPool } from '../server/database.ts';

const filename = process.env.BANK_BROWSER_CREDENTIAL_FILE;
assert.ok(filename, 'Private test credential file required');
const { userIds } = JSON.parse(await readFile(filename, 'utf8')) as { userIds: string[] };
assert.ok(Array.isArray(userIds) && userIds.length === 2);
const runtime = await createStoreFromEnv();
const pool = createMysqlPool();
try {
  const accounts = await Promise.all(userIds.map(id => runtime.store.findUserById(id)));
  assert.ok(accounts.every(user => user?.username.startsWith('bank-') && user.email.endsWith('@cet6.local') && user.nickname === '题库部署验证（完成后停用）'), 'Only generated smoke-test users may be disabled');
  const actor = accounts.find(user => user?.role === 'admin')!;
  for (const item of await runtime.store.listContent()) {
    if (item.ownerId && userIds.includes(item.ownerId)) await runtime.store.updateContentStatus(item.id, item.version, 'withdrawn', actor!.id, '自动化验证结束，保留私有测试记录');
  }
  for (const id of userIds) {
    await runtime.store.revokeUserSessions(id, new Date().toISOString());
    await pool.execute("UPDATE users SET status = 'disabled' WHERE id = ?", [id]);
  }
  console.log('PASS: two test accounts disabled, sessions revoked, private test content withdrawn; audit history retained.');
} finally { await pool.end(); await runtime.store.close?.(); }
