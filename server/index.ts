import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { createStoreFromEnv } from './store-factory.ts';

const runtime = await createStoreFromEnv();
if (runtime.driver === 'memory' && process.env.NODE_ENV !== 'production' && process.env.DEV_BOOTSTRAP_PASSWORD) {
  const email = (process.env.DEV_BOOTSTRAP_EMAIL ?? 'visual-admin@cet6.local').toLowerCase();
  const username = (process.env.DEV_BOOTSTRAP_USERNAME ?? 'visual-admin').toLowerCase();
  if (!await runtime.store.findUserByEmail(email)) {
    await runtime.store.createPasswordUser({ username, email, nickname: '本地管理员', role: 'admin', passwordHash: await hashPassword(process.env.DEV_BOOTSTRAP_PASSWORD), mustChangePassword: false });
  }
}
if (process.argv.includes('--check-config')) {
  console.log(`CET6 Buddy configuration is valid; storage=${runtime.driver}`);
  await runtime.store.close?.();
  process.exit(0);
}
const { handle } = createApp(runtime.store);
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

async function toRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const method = request.method ?? 'GET';
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  return new Request(`http://${request.headers.host ?? `127.0.0.1:${port}`}${request.url ?? '/'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
  });
}

async function send(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => target.setHeader(key, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (request, response) => {
  try {
    await send(await handle(await toRequest(request)), response);
  } catch (cause) {
    console.error(cause);
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误。' } }));
  }
});

server.listen(port, host, () => {
  const database = runtime.database ? ` (${runtime.database.database}, MySQL ${runtime.database.version})` : '';
  console.log(`CET6 Buddy API listening on http://${host}:${port}; storage=${runtime.driver}${database}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await runtime.store.close?.();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
