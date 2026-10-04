import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const limits: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'application/pdf': 20 * 1024 * 1024,
  'audio/mpeg': 50 * 1024 * 1024,
  'audio/mp4': 50 * 1024 * 1024,
  'audio/x-m4a': 50 * 1024 * 1024,
  'audio/wav': 50 * 1024 * 1024,
};

export class UploadError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateUploadMetadata(name: string, mimeType: string, byteSize: number): void {
  if (!name || name.length > 255) throw new UploadError('INVALID_FILE_NAME', '文件名无效。');
  const limit = limits[mimeType];
  if (!limit) throw new UploadError('UNSUPPORTED_FILE_TYPE', '仅支持 JPEG、PNG、PDF、MP3、M4A 和 WAV。');
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > limit) throw new UploadError('FILE_TOO_LARGE', `文件大小超过限制（${Math.round(limit / 1024 / 1024)}MB）。`);
}

export function sniffMime(buffer: Uint8Array): string | undefined {
  const prefix = Buffer.from(buffer.subarray(0, 16));
  if (prefix[0] === 0xff && prefix[1] === 0xd8) return 'image/jpeg';
  if (prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (prefix.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (prefix.subarray(0, 3).toString() === 'ID3' || (prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WAVE') return 'audio/wav';
  if (prefix.subarray(4, 8).toString() === 'ftyp') return 'audio/mp4';
  return undefined;
}

export async function saveLocalFile(file: File, userId: string, env: NodeJS.ProcessEnv = process.env): Promise<{ objectKey: string; sha256: string }> {
  validateUploadMetadata(file.name, file.type, file.size);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffMime(bytes);
  const acceptedDetected = file.type === 'audio/x-m4a' ? detected === 'audio/mp4' : detected === file.type;
  if (!acceptedDetected) throw new UploadError('FILE_SIGNATURE_MISMATCH', '文件内容与声明类型不一致。');
  const suffix = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const objectKey = `private/${userId}/${randomUUID()}${suffix}`;
  const root = env.LOCAL_UPLOAD_DIR ?? '/private/tmp/cet6-buddy-uploads';
  const path = join(root, objectKey);
  await mkdir(join(root, 'private', userId), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
  return { objectKey, sha256: createHash('sha256').update(bytes).digest('hex') };
}

interface StsCredentialResult {
  credentials: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string };
  startTime: number;
  expiredTime: number;
}

export async function createCosUploadGrant(userId: string, fileName: string, mimeType: string, byteSize: number, env: NodeJS.ProcessEnv = process.env): Promise<Record<string, unknown>> {
  validateUploadMetadata(fileName, mimeType, byteSize);
  const required = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION', 'TENCENT_APP_ID'] as const;
  for (const key of required) if (!env[key]) throw new UploadError('COS_NOT_CONFIGURED', `COS 配置缺少 ${key}。`, 503);
  const objectKey = `private/${userId}/${randomUUID()}${extname(fileName).toLowerCase().slice(0, 10)}`;
  const require = createRequire(import.meta.url);
  const sts = require('qcloud-cos-sts') as { getCredential(options: Record<string, unknown>, callback: (error: Error | null, result?: StsCredentialResult) => void): void };
  const resource = `qcs::cos:${env.COS_REGION}:uid/${env.TENCENT_APP_ID}:${env.COS_BUCKET}/${objectKey}`;
  const result = await new Promise<StsCredentialResult>((resolve, reject) => {
    sts.getCredential({
      secretId: env.COS_SECRET_ID,
      secretKey: env.COS_SECRET_KEY,
      durationSeconds: 900,
      policy: { version: '2.0', statement: [{ effect: 'allow', action: ['name/cos:PutObject'], resource: [resource] }] },
    }, (error, credential) => error || !credential ? reject(error ?? new Error('COS STS failed')) : resolve(credential));
  });
  return { driver: 'cos', object_key: objectKey, bucket: env.COS_BUCKET, region: env.COS_REGION, credentials: result.credentials, start_time: result.startTime, expired_time: result.expiredTime };
}

export async function verifyCosObject(objectKey: string, expectedSize: number, expectedSha256: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const require = createRequire(import.meta.url);
  const COS = require('cos-nodejs-sdk-v5') as new (config: Record<string, string>) => { headObject(params: Record<string, string>, callback: (error: Error | null, data?: { headers?: Record<string, string> }) => void): void };
  const client = new COS({ SecretId: env.COS_SECRET_ID ?? '', SecretKey: env.COS_SECRET_KEY ?? '' });
  const data = await new Promise<{ headers?: Record<string, string> }>((resolve, reject) => client.headObject({ Bucket: env.COS_BUCKET ?? '', Region: env.COS_REGION ?? '', Key: objectKey }, (error, result) => error || !result ? reject(error ?? new Error('COS object missing')) : resolve(result)));
  const size = Number(data.headers?.['content-length'] ?? -1);
  const sha256 = data.headers?.['x-cos-meta-sha256'];
  if (size !== expectedSize || sha256 !== expectedSha256) throw new UploadError('COS_OBJECT_MISMATCH', '上传对象的大小或摘要校验失败。', 409);
}

export async function readLocalAsset(objectKey: string, env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  if (!/^private\/[a-f0-9-]+\/[a-f0-9-]+\.[a-z0-9]+$/i.test(objectKey)) throw new UploadError('INVALID_OBJECT_KEY', '附件路径无效。', 400);
  return readFile(join(env.LOCAL_UPLOAD_DIR ?? '/private/tmp/cet6-buddy-uploads', objectKey));
}

export async function createCosDownloadUrl(objectKey: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const require = createRequire(import.meta.url);
  const COS = require('cos-nodejs-sdk-v5') as new (config: Record<string, string>) => { getObjectUrl(params: Record<string, string | number | boolean>, callback: (error: Error | null, data?: { Url?: string }) => void): void };
  const client = new COS({ SecretId: env.COS_SECRET_ID ?? '', SecretKey: env.COS_SECRET_KEY ?? '' });
  return new Promise<string>((resolve, reject) => client.getObjectUrl({ Bucket: env.COS_BUCKET ?? '', Region: env.COS_REGION ?? '', Key: objectKey, Sign: true, Expires: 300 }, (error, data) => error || !data?.Url ? reject(error ?? new Error('COS URL failed')) : resolve(data.Url)));
}
