import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { StudyStore } from './store.ts';
import type { UserAccount, UserRole } from './types.ts';

const COOKIE_NAME = 'cet6_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const FAKE_PASSWORD_HASH = 'scrypt$16384$8$1$0af7f4430e0c8f6e76fa40ea3577be15$0bfb1cba86c328135579e385cd8ce7d61c29aff423be41b5ff5b35c920cfacdd9de6e2d257df7370059bf377e510f3e34ff37dfd7c476d418a7ce9c37cdd284f';

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

export function validUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username);
}

export function validatePassword(password: string): void {
  if (password.length < 10 || password.length > 128) throw new AuthError('WEAK_PASSWORD', '密码长度必须为 10–128 个字符。', 422);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AuthError('WEAK_PASSWORD', '密码必须同时包含字母和数字。', 422);
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, rawN, rawR, rawP, saltHex, hashHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derivePassword(password, Buffer.from(saltHex, 'hex'), expected.length, Number(rawN), Number(rawR), Number(rawP));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateTemporaryPassword(): string {
  return `C6-${randomBytes(12).toString('base64url')}9a`;
}

export interface AuthRuntimeOptions {
  secureCookie: boolean;
}

function derivePassword(password: string, salt: Buffer, length: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N, r, p }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

export function authOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AuthRuntimeOptions {
  const production = env.NODE_ENV === 'production';
  return { secureCookie: production || env.COOKIE_SECURE === 'true' };
}

export class AuthService {
  private readonly store: StudyStore;
  private readonly options: AuthRuntimeOptions;

  constructor(
    store: StudyStore,
    options: AuthRuntimeOptions,
  ) {
    this.store = store;
    this.options = options;
  }

  async login(rawIdentifier: string, password: string, requestIp: string): Promise<{ user: UserAccount; cookie: string }> {
    const identifier = normalizeIdentifier(rawIdentifier);
    if (!identifier || identifier.length > 255 || !password) throw new AuthError('INVALID_AUTH_PAYLOAD', '请输入用户名或邮箱和密码。', 422);
    const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
    const [identifierFailures, ipFailures] = await Promise.all([
      this.store.countRateLimitEvents('password-login', identifier, since),
      this.store.countRateLimitEvents('password-login-ip', requestIp, since),
    ]);
    if (identifierFailures >= 5 || ipFailures >= 20) throw new AuthError('AUTH_RATE_LIMITED', '登录失败次数过多，请 15 分钟后再试。', 429);

    const credential = await this.store.findPasswordCredential(identifier);
    const valid = await verifyPassword(password, credential?.passwordHash ?? FAKE_PASSWORD_HASH);
    if (!credential || !valid) {
      await Promise.all([
        this.store.recordRateLimitEvent('password-login', identifier),
        this.store.recordRateLimitEvent('password-login-ip', requestIp),
      ]);
      throw new AuthError('INVALID_CREDENTIALS', '用户名、邮箱或密码不正确。', 401);
    }
    if (credential.user.status !== 'active') throw new AuthError('ACCOUNT_DISABLED', '账号已停用，请联系管理员。', 403);
    return { user: credential.user, cookie: await this.startSession(credential.user.id) };
  }

  async changePassword(user: UserAccount, currentPassword: string, newPassword: string): Promise<UserAccount> {
    validatePassword(newPassword);
    if (currentPassword === newPassword) throw new AuthError('PASSWORD_UNCHANGED', '新密码不能与当前密码相同。', 422);
    const credential = await this.store.findPasswordCredential(user.email);
    if (!credential || !await verifyPassword(currentPassword, credential.passwordHash)) throw new AuthError('CURRENT_PASSWORD_INVALID', '当前密码不正确。', 401);
    const updated = await this.store.updatePassword(user.id, await hashPassword(newPassword), false);
    if (!updated) throw new AuthError('USER_NOT_FOUND', '账号不存在。', 404);
    return updated;
  }

  async createManagedUser(input: { username: string; email: string; nickname: string; role: UserRole; initialPassword?: string }): Promise<{ user: UserAccount; temporaryPassword: string }> {
    const username = normalizeIdentifier(input.username);
    const email = normalizeIdentifier(input.email);
    const nickname = input.nickname.trim();
    if (!validUsername(username)) throw new AuthError('INVALID_USERNAME', '用户名需为 3–32 位小写字母、数字、点、短横线或下划线。', 422);
    if (!validEmail(email)) throw new AuthError('INVALID_EMAIL', '请输入有效的邮箱地址。', 422);
    if (!nickname || nickname.length > 80) throw new AuthError('INVALID_NICKNAME', '昵称不能为空且不能超过 80 个字符。', 422);
    const temporaryPassword = input.initialPassword || generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    try {
      const user = await this.store.createPasswordUser({ username, email, nickname, role: input.role, passwordHash, mustChangePassword: true });
      return { user, temporaryPassword };
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'USER_ALREADY_EXISTS') throw new AuthError('USER_ALREADY_EXISTS', '用户名或邮箱已经存在。', 409);
      throw cause;
    }
  }

  async resetPassword(userId: string, requestedPassword?: string): Promise<{ user: UserAccount; temporaryPassword: string }> {
    const temporaryPassword = requestedPassword || generateTemporaryPassword();
    const updated = await this.store.updatePassword(userId, await hashPassword(temporaryPassword), true);
    if (!updated) throw new AuthError('USER_NOT_FOUND', '账号不存在。', 404);
    await this.store.revokeUserSessions(userId, new Date().toISOString());
    return { user: updated, temporaryPassword };
  }

  async currentUser(request: Request): Promise<UserAccount | undefined> {
    const token = cookieValue(request, COOKIE_NAME);
    if (!token) return undefined;
    const session = await this.store.findAuthSession(digest(token));
    if (!session || session.expiresAt <= new Date().toISOString()) return undefined;
    const user = await this.store.findUserById(session.userId);
    if (!user || user.status !== 'active') return undefined;
    await this.store.touchAuthSession(session.id, new Date().toISOString());
    return user;
  }

  async requireUser(request: Request, allowPasswordChange = false): Promise<UserAccount> {
    const user = await this.currentUser(request);
    if (!user) throw new AuthError('AUTH_REQUIRED', '请先登录后继续。', 401);
    if (user.mustChangePassword && !allowPasswordChange) throw new AuthError('PASSWORD_CHANGE_REQUIRED', '首次登录必须修改初始密码。', 403);
    return user;
  }

  async logout(request: Request): Promise<string> {
    const token = cookieValue(request, COOKIE_NAME);
    if (token) await this.store.revokeAuthSession(digest(token), new Date().toISOString());
    return this.clearCookie();
  }

  private async startSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.store.createAuthSession({ userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${this.options.secureCookie ? '; Secure' : ''}`;
  }

  private clearCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.options.secureCookie ? '; Secure' : ''}`;
  }
}
