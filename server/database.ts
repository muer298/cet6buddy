import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

function requiredDatabaseName(value: string | undefined): string {
  const database = value?.replace(/^\//, '');
  if (!database) throw new Error('MySQL 数据库名未配置，请设置 DATABASE_URL 或 DB_NAME。');
  return decodeURIComponent(database);
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function mysqlPoolOptions(env: NodeJS.ProcessEnv = process.env): PoolOptions {
  const databaseUrl = env.DATABASE_URL;
  let connection: PoolOptions;

  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL 必须使用 mysql:// 协议。');
    connection = {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: requiredDatabaseName(url.pathname),
    };
  } else {
    connection = {
      host: env.DB_HOST ?? '127.0.0.1',
      port: Number(env.DB_PORT ?? 3306),
      user: env.DB_USER ?? 'root',
      password: env.DB_PASSWORD ?? '',
      database: requiredDatabaseName(env.DB_NAME),
    };
  }

  return {
    ...connection,
    connectionLimit: Number(env.DB_POOL_LIMIT ?? 10),
    enableKeepAlive: true,
    waitForConnections: true,
    queueLimit: 0,
    timezone: 'Z',
    dateStrings: true,
    charset: 'utf8mb4',
    ssl: parseBoolean(env.DB_SSL) ? { rejectUnauthorized: !parseBoolean(env.DB_SSL_ALLOW_SELF_SIGNED) } : undefined,
  };
}

export function createMysqlPool(env: NodeJS.ProcessEnv = process.env): Pool {
  return createPool(mysqlPoolOptions(env));
}

export async function verifyMysqlConnection(pool: Pool): Promise<{ version: string; database: string }> {
  const [rows] = await pool.query<Array<{ version: string; selected_database: string } & import('mysql2').RowDataPacket>>(
    'SELECT VERSION() AS version, DATABASE() AS selected_database',
  );
  return { version: rows[0].version, database: rows[0].selected_database };
}
