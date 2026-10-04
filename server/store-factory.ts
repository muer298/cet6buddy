import { createMysqlPool, verifyMysqlConnection } from './database.ts';
import { MysqlStore } from './mysql-store.ts';
import { InMemoryStore, type StudyStore } from './store.ts';

export interface StoreRuntime {
  driver: 'memory' | 'mysql';
  store: StudyStore;
  database?: { version: string; database: string };
}

export async function createStoreFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<StoreRuntime> {
  const configured = env.STORAGE_DRIVER?.toLowerCase();
  const driver = configured ?? (env.DATABASE_URL ? 'mysql' : 'memory');
  if (driver === 'memory') return { driver, store: new InMemoryStore() };
  if (driver !== 'mysql') throw new Error(`不支持的 STORAGE_DRIVER: ${driver}`);

  const pool = createMysqlPool(env);
  try {
    const database = await verifyMysqlConnection(pool);
    return { driver, database, store: new MysqlStore(pool) };
  } catch (cause) {
    await pool.end();
    throw cause;
  }
}
