import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { createMysqlPool, verifyMysqlConnection } from './database.ts';

const migrationDirectory = fileURLToPath(new URL('./migrations/mysql/', import.meta.url));

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function migrate(): Promise<void> {
  const pool = createMysqlPool();
  try {
    const info = await verifyMysqlConnection(pool);
    const connection = await pool.getConnection();
    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

      const [appliedRows] = await connection.query<Array<RowDataPacket & { name: string }>>('SELECT name FROM schema_migrations');
      const applied = new Set(appliedRows.map(row => row.name));
      const files = (await readdir(migrationDirectory)).filter(file => file.endsWith('.sql')).sort();

      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = await readFile(new URL(`./migrations/mysql/${file}`, import.meta.url), 'utf8');
        await applyMigration(connection, file, splitStatements(sql));
        console.log(`Applied ${file}`);
      }
    } finally {
      connection.release();
    }
    console.log(`MySQL migrations complete: ${info.database} (${info.version})`);
  } finally {
    await pool.end();
  }
}

async function applyMigration(connection: PoolConnection, file: string, statements: string[]): Promise<void> {
  await connection.beginTransaction();
  try {
    for (const statement of statements) await connection.query(statement);
    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    await connection.commit();
  } catch (cause) {
    await connection.rollback();
    throw cause;
  }
}

await migrate();
