import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { EmailSender } from './email.ts';
import type { StudyStore } from './store.ts';
import type { UserAccount } from './types.ts';

const COOKIE_NAME = 'cet6_session';
const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function codeDigest(email: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export interface AuthRuntimeOptions {
  codeSecret: string;
  secureCookie: boolean;
  exposeCode: boolean;
  adminEmails?: string[];
}

export function authOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AuthRuntimeOptions {
  const production = env.NODE_ENV === 'production';
  const codeSecret = env.AUTH_CODE_SECRET ?? (production ? '' : 'cet6-buddy-development-only-secret');
  if (!codeSecret) throw new Error('生产环境必须配置 AUTH_CODE_SECRET。');
  return {
    codeSecret,
    secureCookie: production || env.COOKIE_SECURE === 'true',
    exposeCode: !production && env.AUTH_EXPOSE_CODE === 'true',
    adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean),
  };
}

export class AuthService {
  private readonly store: StudyStore;
  private readonly sender: EmailSender;
  private readonly options: AuthRuntimeOptions;

  constructor(
    store: StudyStore,
    sender: EmailSender,
    options: AuthRuntimeOptions,
  ) {
    this.store = store;
    this.sender = sender;
    this.options = options;
  }

  async requestCode(rawEmail: string, requestIp: string): Promise<{ expiresIn: number; debugCode?: string }> {
    const email = normalizeEmail(rawEmail);
    if (!validEmail(email)) throw new AuthError('INVALID_EMAIL', '请输入有效的邮箱地址。', 422);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await this.store.countRecentAuthCodes(email, requestIp, since);
    if (recent.email >= 5 || recent.ip >= 20) throw new AuthError('AUTH_RATE_LIMITED', '验证码请求过于频繁，请稍后再试。', 429);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.store.createAuthCode({
      email,
      codeHash: codeDigest(email, code, this.options.codeSecret),
      requestIp,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    await this.sender.sendLoginCode(email, code);
    return { expiresIn: CODE_TTL_MS / 1000, ...(this.options.exposeCode ? { debugCode: code } : {}) };
  }

  async verifyCode(rawEmail: string, code: string): Promise<{ user: UserAccount; token: string; cookie: string }> {
    const email = normalizeEmail(rawEmail);
    const record = await this.store.latestAuthCode(email);
    if (!record || record.expiresAt <= new Date().toISOString()) throw new AuthError('AUTH_CODE_EXPIRED', '验证码已过期，请重新获取。', 401);
    if (record.attemptCount >= 5) throw new AuthError('AUTH_CODE_LOCKED', '验证码尝试次数过多，请重新获取。', 429);
    const submitted = codeDigest(email, code.trim(), this.options.codeSecret);
    if (!equalHex(record.codeHash, submitted)) {
      await this.store.incrementAuthCodeAttempts(record.id);
      throw new AuthError('AUTH_CODE_INVALID', '验证码不正确。', 401);
    }
    const consumed = await this.store.consumeAuthCode(record.id, new Date().toISOString());
    if (!consumed) throw new AuthError('AUTH_CODE_USED', '验证码已经使用，请重新获取。', 409);

    const nickname = email.split('@')[0].slice(0, 20) || '六级学习者';
    let user = await this.store.findUserByEmail(email) ?? await this.store.createUser(email, nickname);
    if (this.options.adminEmails?.includes(email) && user.role !== 'admin') user = await this.store.setUserRole(user.id, 'admin') ?? user;
    const token = randomBytes(32).toString('base64url');
    await this.store.createAuthSession({ userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
    return { user, token, cookie: this.sessionCookie(token) };
  }

  async currentUser(request: Request): Promise<UserAccount | undefined> {
    const token = cookieValue(request, COOKIE_NAME);
    if (!token) return undefined;
    const session = await this.store.findAuthSession(digest(token));
    if (!session || session.expiresAt <= new Date().toISOString()) return undefined;
    const user = await this.store.findUserById(session.userId);
    if (!user) return undefined;
    await this.store.touchAuthSession(session.id, new Date().toISOString());
    return user;
  }

  async requireUser(request: Request): Promise<UserAccount> {
    const user = await this.currentUser(request);
    if (!user) throw new AuthError('AUTH_REQUIRED', '请先登录后继续。', 401);
    return user;
  }

  async logout(request: Request): Promise<string> {
    const token = cookieValue(request, COOKIE_NAME);
    if (token) await this.store.revokeAuthSession(digest(token), new Date().toISOString());
    return this.clearCookie();
  }

  private sessionCookie(token: string): string {
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${this.options.secureCookie ? '; Secure' : ''}`;
  }

  private clearCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.options.secureCookie ? '; Secure' : ''}`;
  }
}
