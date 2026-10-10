import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createPool } from 'mysql2/promise';
import { mysqlPoolOptions } from '../server/database.ts';

// Destructive cleanup is restricted to the fresh local test schema created by this run.
const options = mysqlPoolOptions();
if (!['127.0.0.1', 'localhost', '::1'].includes(String(options.host))) throw new Error('This runner only permits local MySQL. It must never target production.');
const database = `cet6_regression_${randomBytes(8).toString('hex')}`;
const pool = createPool(options);
let created = false;
try {
  await pool.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  created = true;
  const env = { ...process.env, DATABASE_URL: '', DB_HOST: String(options.host), DB_PORT: String(options.port ?? 3306), DB_USER: String(options.user), DB_PASSWORD: String(options.password ?? ''), DB_NAME: database, CET6_TEST_MYSQL: '1' };
  for (const args of [['server/migrate.ts'], ['--test', 'server/learning-regression.test.ts']]) {
    const child = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
    if (child.status !== 0) { process.exitCode = 1; break; }
  }
} finally {
  if (created) { await pool.query(`DROP DATABASE \`${database}\``); console.log('Removed only the disposable regression schema; application databases were not changed.'); }
  await pool.end();
}
