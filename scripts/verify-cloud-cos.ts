// Explicit deployment smoke test: creates two disabled-after-test learner accounts
// and a tiny private PNG/import. It does not delete cloud objects or publish content.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createStoreFromEnv } from '../server/store-factory.ts';
import { createMysqlPool } from '../server/database.ts';
import { hashPassword } from '../server/auth.ts';
import { createCosUploadGrant, verifyCosObject, createCosDownloadUrl } from '../server/upload.ts';

const require = createRequire(import.meta.url);
const COS = require('cos-nodejs-sdk-v5');
const origin = process.env.CORS_ORIGIN;
assert.equal(process.env.COS_BUCKET, 'cet6-1421801104');
assert.equal(process.env.STORAGE_DRIVER, 'mysql');
assert.equal(origin, 'https://101.33.35.107');
const runtime = await createStoreFromEnv();
const pool = createMysqlPool();
const users: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const sha256 = createHash('sha256').update(png).digest('hex');
const invoke = (client: any, method: string, params: object): Promise<any> => new Promise((resolve, reject) => client[method](params, (err: any, data: any) => err ? reject(err) : resolve(data)));
async function denied(action: Promise<any>): Promise<void> {
  try { await action; } catch (e: any) { assert.equal(e.statusCode, 403, 'COS must reject forbidden operation'); return; }
  throw new Error('COS unexpectedly allowed forbidden operation');
}
async function learner(suffix: string) {
  const username = `cos-${Date.now()}-${suffix}`;
  const password = `C6-${randomBytes(16).toString('base64url')}9a`;
  const user = await runtime.store.createPasswordUser({ username, email: `${username}@cet6.local`, nickname: 'COS部署验证（完成后停用）', role: 'learner', passwordHash: await hashPassword(password), mustChangePassword: false });
  users.push(user.id);
  const response = await fetch(`${origin}/api/auth/password/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin! }, body: JSON.stringify({ identifier: username, password }) });
  assert.equal(response.status, 200, 'Test learner login');
  const cookie = response.headers.get('set-cookie')!;
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax']) assert.ok(cookie.includes(flag));
  return { user, headers: { cookie: cookie.split(';')[0], origin: origin!, 'content-type': 'application/json' } };
}
try {
  const owner = await learner('owner');
  const other = await learner('other');
  const params = { file_name: 'cos-deployment-verification.png', mime_type: 'image/png', byte_size: png.length };
  let grant: any;
  if (process.env.UPLOAD_DRIVER === 'cos') {
    assert.equal((await fetch(`${origin}/api/uploads/credentials`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) })).status, 401);
    const response = await fetch(`${origin}/api/uploads/credentials`, { method: 'POST', headers: owner.headers, body: JSON.stringify(params) });
    assert.equal(response.status, 200, 'API temporary upload grant');
    grant = await response.json();
  } else {
    grant = await createCosUploadGrant(owner.user.id, params.file_name, params.mime_type, params.byte_size);
  }
  assert.ok(grant.object_key.startsWith(`private/${owner.user.id}/`));
  assert.equal(grant.expired_time - grant.start_time, 900);
  const client = new COS({ SecretId: grant.credentials.tmpSecretId, SecretKey: grant.credentials.tmpSecretKey, SecurityToken: grant.credentials.sessionToken, Protocol: 'https:' });
  const object = { Bucket: grant.bucket, Region: grant.region, Key: grant.object_key };
  await invoke(client, 'putObject', { ...object, Body: png, ContentType: params.mime_type, Headers: { 'x-cos-meta-sha256': sha256 } });
  await denied(invoke(client, 'getObject', object));
  await denied(invoke(client, 'putObject', { ...object, Key: `${grant.object_key}.forbidden`, Body: png }));
  await verifyCosObject(grant.object_key, png.length, sha256);
  const signed = await createCosDownloadUrl(grant.object_key);
  assert.equal(new URL(signed).protocol, 'https:', 'Signed downloads must use HTTPS');
  const downloaded = await fetch(signed);
  assert.equal(downloaded.status, 200, 'Signed COS download');
  assert.equal(createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex'), sha256);
  const unsigned = new URL(signed); unsigned.search = '';
  assert.equal((await fetch(unsigned)).status, 403, 'Private object must reject unsigned download');
  const preflightHeaders = { origin: origin!, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization,cache-control,content-type,x-cos-security-token,x-cos-meta-sha256,x-cos-sdk-retry' };
  const cors = await fetch(unsigned, { method: 'OPTIONS', headers: preflightHeaders });
  assert.equal(cors.status, 200, 'COS preflight');
  assert.equal(cors.headers.get('access-control-allow-origin'), origin);
  const foreign = await fetch(unsigned, { method: 'OPTIONS', headers: { ...preflightHeaders, origin: 'https://untrusted.invalid' } });
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://untrusted.invalid');
  console.log('PASS: real PNG upload, single-object/upload-only STS scope, signed HTTPS download, identical SHA-256, unsigned 403, exact-origin CORS.');
  if (process.env.UPLOAD_DRIVER === 'cos') {
    const confirmation = { object_key: grant.object_key, original_name: params.file_name, mime_type: params.mime_type, byte_size: png.length, sha256 };
    const reject = await fetch(`${origin}/api/uploads/confirm`, { method: 'POST', headers: other.headers, body: JSON.stringify(confirmation) });
    assert.equal(reject.status, 422, 'Other user cannot confirm owner object');
    const confirmed = await fetch(`${origin}/api/uploads/confirm`, { method: 'POST', headers: owner.headers, body: JSON.stringify(confirmation) });
    assert.equal(confirmed.status, 201, 'Confirm uploaded object');
    const asset = (await confirmed.json() as any).asset;
    const url = `${origin}/api/assets/${asset.id}/download`;
    assert.equal((await fetch(url, { redirect: 'manual' })).status, 401);
    assert.equal((await fetch(url, { headers: other.headers, redirect: 'manual' })).status, 404);
    const response = await fetch(url, { headers: owner.headers, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get('location')!).protocol, 'https:');
    const result = await fetch(response.headers.get('location')!);
    assert.equal(result.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await result.arrayBuffer())).digest('hex'), sha256);
    console.log(`PASS: API grant, confirmation, owner download, anonymous 401 and non-owner 404. Test asset: ${asset.id}`);
  }
} catch (e: any) {
  console.error('COS verification failed:', e.code ?? e.name, e.statusCode ?? '', e.name === 'AssertionError' ? e.message : 'See protected server diagnostics; credentials are not printed.');
  process.exitCode = 1;
} finally {
  for (const id of users) {
    await runtime.store.revokeUserSessions(id, new Date().toISOString());
    await pool.execute("UPDATE users SET status='disabled' WHERE id=?", [id]);
  }
  await pool.end();
  await runtime.store.close?.();
}
