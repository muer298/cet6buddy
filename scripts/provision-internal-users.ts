import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import type { RowDataPacket } from 'mysql2/promise';
import { createMysqlPool } from '../server/database.ts';
import { hashPassword, validUsername } from '../server/auth.ts';

// Operator-only CLI; never expose as an HTTP route or place passwords in source/env files.
// Input: one JSON line on stdin: [{"username":"...","password":"..."}].
// Short preset exceptions require an explicit operator flag; normal app policy stays unchanged.
const input = createInterface({ input: process.stdin, terminal: false });
const iterator = input[Symbol.asyncIterator]();
const line = (await iterator.next()).value;
input.close();
assert.ok(line && line.length <= 8192, 'One bounded JSON line is required');
const accounts = JSON.parse(line) as Array<{ username: string; password: string }>;
assert.ok(Array.isArray(accounts) && accounts.length > 0 && accounts.length <= 10);
assert.equal(new Set(accounts.map(a => a.username)).size, accounts.length, 'Duplicate usernames');
const allowShort = process.argv.includes('--allow-short-presets');
const prepared = [];
for (const account of accounts) {
  assert.ok(typeof account.username === 'string' && validUsername(account.username));
  assert.ok(typeof account.password === 'string' && account.password.length >= 7 && account.password.length <= 128 && /[a-z]/i.test(account.password) && /\d/.test(account.password), 'Invalid preset password');
  let passwordHash: string;
  if (account.password.length < 10 && allowShort) {
    const salt = randomBytes(16);
    passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync(account.password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
  } else passwordHash = await hashPassword(account.password);
  prepared.push({ ...account, id: randomUUID(), passwordHash });
}

const pool = createMysqlPool();
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  for (const account of prepared) {
    const [existing] = await connection.execute<RowDataPacket[]>('SELECT id FROM users WHERE username = ? OR email = ? FOR UPDATE', [account.username, `${account.username}@users.cet6.invalid`]);
    assert.equal(existing.length, 0, `Account ${account.username} already exists; no passwords were changed`);
    await connection.execute("INSERT INTO users (id, username, email, role, password_hash, must_change_password, status) VALUES (?, ?, ?, 'learner', ?, FALSE, 'active')", [account.id, account.username, `${account.username}@users.cet6.invalid`, account.passwordHash]);
    await connection.execute("INSERT INTO profiles (user_id, nickname, plan_tier, timezone) VALUES (?, ?, 'standard', 'Asia/Shanghai')", [account.id, account.username]);
    await connection.execute("INSERT INTO user_settings (user_id, current_plan_tier, timezone) VALUES (?, 'standard', 'Asia/Shanghai')", [account.id]);
    await connection.execute("INSERT INTO audit_logs (id, action, target_type, target_id, metadata_json) VALUES (?, 'internal_account_provisioned', 'user', ?, ?)", [randomUUID(), account.id, JSON.stringify({ username: account.username, role: 'learner', operator_cli: true, short_preset_exception: account.password.length < 10, must_change_password: false })]);
  }
  await connection.commit();
  const origin = process.env.CORS_ORIGIN!;
  assert.ok(origin?.startsWith('https://'), 'HTTPS origin required for verification');
  for (const account of prepared) {
    const response = await fetch(`${origin}/api/auth/password/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ identifier: account.username, password: account.password }), signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `Login failed for ${account.username}`);
    const result = await response.json() as { user: { id: string; role: string; mustChangePassword: boolean } };
    assert.equal(result.user.id, account.id);
    assert.equal(result.user.role, 'learner');
    assert.equal(result.user.mustChangePassword, false);
    const cookie = response.headers.get('set-cookie')!;
    assert.ok(cookie.includes('Secure') && cookie.includes('HttpOnly'));
    const headers = { cookie: cookie.split(';')[0], origin };
    const plan = await fetch(`${origin}/api/me/plan`, { headers, signal: AbortSignal.timeout(20000) });
    assert.equal(plan.status, 200);
    const admin = await fetch(`${origin}/api/admin/content`, { headers, signal: AbortSignal.timeout(20000) });
    assert.equal(admin.status, 403);
    await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers, signal: AbortSignal.timeout(20000) });
    console.log(`PASS ${account.username}: created, login verified, learner only, no first-login password change`);
  }
} catch (cause) { await connection.rollback(); throw cause; }
finally {
  // Remove verification sessions even if an HTTP check failed; never revoke another user's session.
  for (const account of prepared) await pool.execute('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [account.id]);
  connection.release();
  await pool.end();
}
