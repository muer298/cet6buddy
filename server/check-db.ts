import { createMysqlPool, verifyMysqlConnection } from './database.ts';

const pool = createMysqlPool();
try {
  const info = await verifyMysqlConnection(pool);
  console.log(`MySQL connection OK: database=${info.database}, version=${info.version}`);
} finally {
  await pool.end();
}
