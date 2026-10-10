import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AssetRecord, AuthSessionRecord, ChallengeParticipation, ChallengeRecord, CollectionEntry, ContentRecord, DailyTaskState, GameAttemptRecord, GameSessionRecord, GameType, ImportRecord, OpenSubmission, PasswordCredential, PointEntry, ReviewSkill, ReviewState, StoredAttempt, StudySession, TeamRecord, UserAccount, UserRole } from './types.ts';
import { dailyTaskDefinitions, nextReviewInterval, type StudyStore } from './store.ts';
import { decodeSelection, encodeSelection } from './question-bank.ts';

interface SessionRow extends RowDataPacket {
  id: string;
  user_id: string;
  source: string;
  mode: StudySession['mode'];
  status: StudySession['status'];
  question_ids_json: string | string[];
  created_at: string | Date;
  finished_at: string | Date | null;
}

interface AttemptRow extends RowDataPacket {
  id: string;
  session_id: string;
  user_id: string;
  question_id: string;
  question_version: number;
  answer_index: number;
  is_correct: number | boolean;
  idempotency_key: string;
  submitted_at: string | Date;
}

interface PointRow extends RowDataPacket {
  id: string;
  user_id: string;
  points: number;
  reward_key: string;
  reason: string;
  created_at: string | Date;
}

interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  email: string;
  role: UserAccount['role'];
  password_hash?: string | null;
  must_change_password: number | boolean;
  status: UserAccount['status'];
  nickname: string;
  plan_tier: UserAccount['planTier'];
  exam_date: string | null;
  timezone: string;
  created_at: string | Date;
}

interface AuthSessionRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | Date;
  created_at: string | Date;
  last_seen_at: string | Date;
  revoked_at: string | Date | null;
}

function timestamp(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized).toISOString();
}

function mapSession(row: SessionRow): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    mode: row.mode,
    status: row.status,
    ...decodeSelection(row.question_ids_json),
    createdAt: timestamp(row.created_at),
    finishedAt: row.finished_at ? timestamp(row.finished_at) : undefined,
  };
}

function mapAttempt(row: AttemptRow): StoredAttempt {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    questionId: row.question_id,
    questionVersion: row.question_version,
    answerIndex: row.answer_index,
    correct: Boolean(row.is_correct),
    idempotencyKey: row.idempotency_key,
    submittedAt: timestamp(row.submitted_at),
  };
}

function mapPoint(row: PointRow): PointEntry {
  return {
    id: row.id,
    userId: row.user_id,
    points: row.points,
    rewardKey: row.reward_key,
    reason: row.reason,
    createdAt: timestamp(row.created_at),
  };
}

function mapUser(row: UserRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    status: row.status,
    nickname: row.nickname,
    planTier: row.plan_tier,
    examDate: row.exam_date ?? undefined,
    timezone: row.timezone,
    createdAt: timestamp(row.created_at),
  };
}

function mapAuthSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
    lastSeenAt: timestamp(row.last_seen_at),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : undefined,
  };
}

function parseJson<T>(value: string | T): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function mapGameSession(row: RowDataPacket & Record<string, unknown>): GameSessionRecord {
  return {
    id: String(row.id), userId: String(row.user_id), gameType: row.game_type as GameType,
    mode: row.mode as GameSessionRecord['mode'], status: row.status as GameSessionRecord['status'],
    ...decodeSelection(row.question_ids_json), rules: parseJson(row.rules_json as string | GameSessionRecord['rules']),
    score: Number(row.score), correctCount: Number(row.correct_count), currentStreak: Number(row.current_streak), longestStreak: Number(row.longest_streak),
    createdAt: timestamp(row.created_at as string | Date), finishedAt: row.finished_at ? timestamp(row.finished_at as string | Date) : undefined,
  };
}

function mapGameAttempt(row: RowDataPacket & Record<string, unknown>): GameAttemptRecord {
  return {
    id: String(row.id), gameSessionId: String(row.game_session_id), userId: String(row.user_id), questionId: String(row.question_id),
    questionVersion: Number(row.question_version), answerIndex: row.answer_index === null ? null : Number(row.answer_index), correct: Boolean(row.is_correct),
    points: Number(row.points), idempotencyKey: String(row.idempotency_key), submittedAt: timestamp(row.submitted_at as string | Date),
  };
}

function mapTeam(row: RowDataPacket & Record<string, unknown>): TeamRecord {
  return {
    id: String(row.id), name: String(row.name), ownerId: String(row.owner_id), inviteCode: String(row.invite_code),
    inviteExpiresAt: timestamp(row.invite_expires_at as string | Date), memberLimit: Number(row.member_limit), goalTarget: Number(row.goal_target), createdAt: timestamp(row.created_at as string | Date),
  };
}

function mapChallenge(row: RowDataPacket & Record<string, unknown>): ChallengeRecord {
  return {
    id: String(row.id), teamId: String(row.team_id), creatorId: String(row.creator_id), gameType: row.game_type as GameType,
    title: String(row.title), ...decodeSelection(row.question_ids_json), rules: parseJson(row.rules_json as string | GameSessionRecord['rules']),
    status: row.status as ChallengeRecord['status'], deadlineAt: timestamp(row.deadline_at as string | Date), createdAt: timestamp(row.created_at as string | Date),
  };
}

async function findAttempt(connection: Pool | PoolConnection, input: { sessionId: string; questionId: string; idempotencyKey: string }): Promise<StoredAttempt | undefined> {
  const [rows] = await connection.execute<AttemptRow[]>(
    `SELECT id, session_id, user_id, question_id, question_version, answer_index,
            is_correct, idempotency_key, submitted_at
       FROM attempts
      WHERE idempotency_key = ? OR (session_id = ? AND question_id = ?)
      ORDER BY submitted_at ASC
      LIMIT 1`,
    [input.idempotencyKey, input.sessionId, input.questionId],
  );
  return rows[0] ? mapAttempt(rows[0]) : undefined;
}

function isDuplicateKey(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'errno' in cause && cause.errno === 1062;
}

export class MysqlStore implements StudyStore {
  async learningActivity(userId: string) {
    const [rows] = await this.pool.execute<Array<AttemptRow & { source: string; corrected: number }>>(
      `SELECT a.*, s.source, EXISTS(SELECT 1 FROM corrections c WHERE c.attempt_id = a.id AND c.user_id = a.user_id) AS corrected
       FROM attempts a JOIN study_sessions s ON s.id = a.session_id
       WHERE a.user_id = ? AND s.user_id = ? AND s.mode = 'practice' ORDER BY a.submitted_at DESC`, [userId, userId]);
    return rows.map(row => ({ ...mapAttempt(row), source: row.source, corrected: Boolean(row.corrected) }));
  }

  async learningTotals(userId: string, start: string, end: string) {
    const [words] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM (
        SELECT a.question_id AS content_id FROM attempts a JOIN study_sessions s ON s.id = a.session_id
        WHERE a.user_id = ? AND s.user_id = ? AND s.mode = 'practice' AND s.source NOT IN ('reading', 'listening') AND a.question_id NOT LIKE '%:%'
        UNION SELECT content_item_id FROM spelling_attempts WHERE user_id = ?
       ) practiced`, [userId, userId, userId]);
    const [points] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(SUM(points), 0) AS total FROM point_ledger WHERE user_id = ? AND created_at >= ? AND created_at < ?', [userId, new Date(start), new Date(end)]);
    return { practicedWords: Number(words[0].total), todayPoints: Number(points[0].total) };
  }
  private readonly rootPool: Pool;
  private readonly transaction = new AsyncLocalStorage<Pool>();
  private get pool(): Pool { return this.transaction.getStore() ?? this.rootPool; }

  constructor(pool: Pool) {
    this.rootPool = pool;
  }

  async atomic<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    if (this.transaction.getStore()) return operation();
    const connection = await this.rootPool.getConnection();
    // Existing store helpers share the outer transaction; they must not commit or release it.
    const nested = new Proxy(connection, { get(target, key) {
      if (['beginTransaction', 'commit', 'rollback', 'release'].includes(String(key))) return async () => {};
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const scoped = { execute: connection.execute.bind(connection), query: connection.query.bind(connection), getConnection: async () => nested } as unknown as Pool;
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      const result = await this.transaction.run(scoped, operation);
      await connection.commit();
      return result;
    } catch (cause) { await connection.rollback(); throw cause; }
    finally { connection.release(); }
  }

  async createSession(input: Omit<StudySession, 'id' | 'createdAt' | 'status'>): Promise<StudySession> {
    const session: StudySession = {
      ...input,
      id: randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await this.pool.execute(
      `INSERT INTO study_sessions
        (id, user_id, source, mode, status, question_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.source, session.mode, session.status, encodeSelection(session), new Date(session.createdAt)],
    );
    return session;
  }

  async getSession(sessionId: string): Promise<StudySession | undefined> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT id, user_id, source, mode, status, question_ids_json, created_at, finished_at
         FROM study_sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    return rows[0] ? mapSession(rows[0]) : undefined;
  }

  async saveAttempt(input: Omit<StoredAttempt, 'id' | 'submittedAt'>): Promise<{ attempt: StoredAttempt; duplicate: boolean }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const previous = await findAttempt(connection, input);
      if (previous) {
        await connection.commit();
        return { attempt: previous, duplicate: true };
      }

      const attempt: StoredAttempt = { ...input, id: randomUUID(), submittedAt: new Date().toISOString() };
      await connection.execute<ResultSetHeader>(
        `INSERT INTO attempts
          (id, session_id, user_id, question_id, question_version, answer_index, is_correct, idempotency_key, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [attempt.id, attempt.sessionId, attempt.userId, attempt.questionId, attempt.questionVersion, attempt.answerIndex, attempt.correct, attempt.idempotencyKey, new Date(attempt.submittedAt)],
      );
      await connection.commit();
      return { attempt, duplicate: false };
    } catch (cause) {
      await connection.rollback();
      if (isDuplicateKey(cause)) {
        const previous = await findAttempt(this.pool, input);
        if (previous) return { attempt: previous, duplicate: true };
      }
      throw cause;
    } finally {
      connection.release();
    }
  }

  async attemptsForSession(sessionId: string): Promise<StoredAttempt[]> {
    const [rows] = await this.pool.execute<AttemptRow[]>(
      `SELECT id, session_id, user_id, question_id, question_version, answer_index,
              is_correct, idempotency_key, submitted_at
         FROM attempts WHERE session_id = ? ORDER BY submitted_at ASC`,
      [sessionId],
    );
    return rows.map(mapAttempt);
  }

  async finishSession(sessionId: string): Promise<StudySession | undefined> {
    await this.pool.execute(
      `UPDATE study_sessions
          SET status = 'finished', finished_at = COALESCE(finished_at, UTC_TIMESTAMP(3))
        WHERE id = ? AND status = 'active'`,
      [sessionId],
    );
    return this.getSession(sessionId);
  }

  async awardPoints(userId: string, rewardKey: string, points: number, reason: string): Promise<{ entry: PointEntry; awarded: boolean }> {
    const connection = await this.pool.getConnection();
    const now = new Date();
    const shanghaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const start = new Date(`${shanghaiDate}T00:00:00+08:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      const [previousRows] = await connection.execute<PointRow[]>(`SELECT id, user_id, points, reward_key, reason, created_at FROM point_ledger WHERE reward_key = ? LIMIT 1`, [rewardKey]);
      if (previousRows[0]) {
        await connection.rollback();
        return { entry: mapPoint(previousRows[0]), awarded: false };
      }
      const [sumRows] = await connection.execute<Array<RowDataPacket & { earned: number }>>(`SELECT COALESCE(SUM(points), 0) AS earned FROM point_ledger WHERE user_id = ? AND created_at >= ? AND created_at < ?`, [userId, start, end]);
      const granted = Math.max(0, Math.min(points, 45 - Number(sumRows[0].earned)));
      const entry: PointEntry = { id: randomUUID(), userId, rewardKey, points: granted, reason, createdAt: now.toISOString() };
      if (!granted) {
        await connection.rollback();
        return { entry, awarded: false };
      }
      await connection.execute(
        `INSERT INTO point_ledger (id, user_id, points, reason, reward_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.userId, entry.points, entry.reason, entry.rewardKey, new Date(entry.createdAt)],
      );
      await connection.commit();
      return { entry, awarded: true };
    } catch (cause) {
      await connection.rollback();
      if (!isDuplicateKey(cause)) throw cause;
      const [rows] = await connection.execute<PointRow[]>(`SELECT id, user_id, points, reward_key, reason, created_at FROM point_ledger WHERE reward_key = ? LIMIT 1`, [rewardKey]);
      if (!rows[0]) throw cause;
      return { entry: mapPoint(rows[0]), awarded: false };
    } finally {
      connection.release();
    }
  }

  async findUserByEmail(email: string): Promise<UserAccount | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.email, u.role, u.must_change_password, u.status, p.nickname, p.plan_tier, p.exam_date, p.timezone, u.created_at
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findUserByUsername(username: string): Promise<UserAccount | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.email, u.role, u.must_change_password, u.status, p.nickname, p.plan_tier, p.exam_date, p.timezone, u.created_at
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.username = ? LIMIT 1`,
      [username],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findUserById(userId: string): Promise<UserAccount | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.email, u.role, u.must_change_password, u.status, p.nickname, p.plan_tier, p.exam_date, p.timezone, u.created_at
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createUser(email: string, nickname: string): Promise<UserAccount> {
    const existing = await this.findUserByEmail(email);
    if (existing) return existing;
    const connection = await this.pool.getConnection();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await connection.beginTransaction();
      const username = `legacy_${id.replaceAll('-', '').slice(0, 24)}`;
      await connection.execute('INSERT INTO users (id, username, email, role, must_change_password, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, username, email, 'learner', true, 'active', new Date(createdAt)]);
      await connection.execute(
        'INSERT INTO profiles (user_id, nickname, plan_tier, timezone) VALUES (?, ?, ?, ?)',
        [id, nickname, 'standard', 'Asia/Shanghai'],
      );
      await connection.execute(
        'INSERT INTO user_settings (user_id, current_plan_tier, timezone) VALUES (?, ?, ?)',
        [id, 'standard', 'Asia/Shanghai'],
      );
      await connection.commit();
      return { id, username, email, nickname, role: 'learner', mustChangePassword: true, status: 'active', planTier: 'standard', timezone: 'Asia/Shanghai', createdAt };
    } catch (cause) {
      await connection.rollback();
      if (isDuplicateKey(cause)) {
        const concurrent = await this.findUserByEmail(email);
        if (concurrent) return concurrent;
      }
      throw cause;
    } finally {
      connection.release();
    }
  }

  async createPasswordUser(input: { username: string; email: string; nickname: string; role: UserRole; passwordHash: string; mustChangePassword: boolean }): Promise<UserAccount> {
    const connection = await this.pool.getConnection();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO users (id, username, email, role, password_hash, must_change_password, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, input.username, input.email, input.role, input.passwordHash, input.mustChangePassword, 'active', new Date(createdAt)],
      );
      await connection.execute('INSERT INTO profiles (user_id, nickname, plan_tier, timezone) VALUES (?, ?, ?, ?)', [id, input.nickname, 'standard', 'Asia/Shanghai']);
      await connection.execute('INSERT INTO user_settings (user_id, current_plan_tier, timezone) VALUES (?, ?, ?)', [id, 'standard', 'Asia/Shanghai']);
      await connection.commit();
      return { id, username: input.username, email: input.email, nickname: input.nickname, role: input.role, mustChangePassword: input.mustChangePassword, status: 'active', planTier: 'standard', timezone: 'Asia/Shanghai', createdAt };
    } catch (cause) {
      await connection.rollback();
      if (isDuplicateKey(cause)) throw new Error('USER_ALREADY_EXISTS');
      throw cause;
    } finally {
      connection.release();
    }
  }

  async findPasswordCredential(identifier: string): Promise<PasswordCredential | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.email, u.role, u.password_hash, u.must_change_password, u.status,
              p.nickname, p.plan_tier, p.exam_date, p.timezone, u.created_at
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.email = ? OR u.username = ? LIMIT 1`,
      [identifier, identifier],
    );
    const row = rows[0];
    return row?.password_hash ? { user: mapUser(row), passwordHash: row.password_hash } : undefined;
  }

  async updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<UserAccount | undefined> {
    await this.pool.execute('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?', [passwordHash, mustChangePassword, userId]);
    return this.findUserById(userId);
  }

  async listUsers(): Promise<UserAccount[]> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT u.id, u.username, u.email, u.role, u.must_change_password, u.status, p.nickname, p.plan_tier, p.exam_date, p.timezone, u.created_at
         FROM users u JOIN profiles p ON p.user_id = u.id ORDER BY u.created_at ASC`,
    );
    return rows.map(mapUser);
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<void> {
    await this.pool.execute('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [new Date(revokedAt), userId]);
  }

  async countRateLimitEvents(scope: string, scopeKey: string, since: string): Promise<number> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { event_count: number }>>(
      'SELECT COUNT(*) AS event_count FROM rate_limit_events WHERE scope = ? AND scope_key = ? AND created_at >= ?',
      [scope, scopeKey, new Date(since)],
    );
    return Number(rows[0]?.event_count ?? 0);
  }

  async recordRateLimitEvent(scope: string, scopeKey: string): Promise<void> {
    await this.pool.execute('INSERT INTO rate_limit_events (scope, scope_key) VALUES (?, ?)', [scope, scopeKey]);
  }

  async createAuthSession(input: Omit<AuthSessionRecord, 'id' | 'createdAt' | 'lastSeenAt'>): Promise<AuthSessionRecord> {
    const now = new Date().toISOString();
    const session: AuthSessionRecord = { ...input, id: randomUUID(), createdAt: now, lastSeenAt: now };
    await this.pool.execute(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.tokenHash, new Date(session.expiresAt), new Date(now), new Date(now)],
    );
    return session;
  }

  async findAuthSession(tokenHash: string): Promise<AuthSessionRecord | undefined> {
    const [rows] = await this.pool.execute<AuthSessionRow[]>(
      `SELECT id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at
         FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ? mapAuthSession(rows[0]) : undefined;
  }

  async touchAuthSession(sessionId: string, seenAt: string): Promise<void> {
    await this.pool.execute('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?', [new Date(seenAt), sessionId]);
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<void> {
    await this.pool.execute(
      'UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      [new Date(revokedAt), tokenHash],
    );
  }

  async listReviews(userId: string, dueBefore: string): Promise<ReviewState[]> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & {
      user_id: string; content_item_id: string; skill: ReviewSkill; due_at: string | Date; interval_days: number; updated_at: string | Date; payload_json: string | Record<string, unknown> | null;
    }>>(
      `SELECT r.user_id, r.content_item_id, r.skill, r.due_at, r.interval_days, r.updated_at, cv.payload_json
         FROM review_states r
         LEFT JOIN content_versions cv ON cv.content_item_id = r.content_item_id AND cv.status = 'published'
        WHERE r.user_id = ? AND r.due_at <= ?
        ORDER BY r.due_at ASC`,
      [userId, new Date(dueBefore)],
    );
    return rows.map(row => ({
      userId: row.user_id,
      contentItemId: row.content_item_id,
      skill: row.skill,
      dueAt: timestamp(row.due_at),
      intervalDays: row.interval_days,
      updatedAt: timestamp(row.updated_at),
      payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) as Record<string, unknown> : row.payload_json ?? undefined,
    }));
  }

  async updateReviewState(userId: string, contentItemId: string, skill: ReviewSkill, correct: boolean, reviewedAt: string): Promise<ReviewState> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Array<RowDataPacket & { interval_days: number }>>(
        'SELECT interval_days FROM review_states WHERE user_id = ? AND content_item_id = ? AND skill = ? FOR UPDATE',
        [userId, contentItemId, skill],
      );
      const intervalDays = nextReviewInterval(rows[0]?.interval_days ?? 0, correct);
      const dueAt = new Date(reviewedAt);
      dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays);
      await connection.execute(
        `INSERT INTO review_states (user_id, content_item_id, skill, due_at, interval_days, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), interval_days = VALUES(interval_days), updated_at = VALUES(updated_at)`,
        [userId, contentItemId, skill, dueAt, intervalDays, new Date(reviewedAt)],
      );
      await connection.commit();
      return { userId, contentItemId, skill, dueAt: dueAt.toISOString(), intervalDays, updatedAt: reviewedAt };
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  async listCollections(userId: string, kind?: string): Promise<CollectionEntry[]> {
    const params: string[] = [userId];
    const kindClause = kind ? ' AND kind = ?' : '';
    if (kind) params.push(kind);
    const [rows] = await this.pool.execute<Array<RowDataPacket & {
      id: string; user_id: string; content_item_id: string; content_version: number; kind: string; note: string | null; created_at: string | Date;
    }>>(
      `SELECT id, user_id, content_item_id, content_version, kind, note, created_at FROM collections WHERE user_id = ?${kindClause} ORDER BY created_at DESC`,
      params,
    );
    return rows.map(row => ({ id: row.id, userId: row.user_id, contentItemId: row.content_item_id, contentVersion: row.content_version, kind: row.kind, note: row.note ?? undefined, createdAt: timestamp(row.created_at) }));
  }

  async addCollection(input: Omit<CollectionEntry, 'id' | 'createdAt'>): Promise<CollectionEntry> {
    const entry: CollectionEntry = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.pool.execute(
      `INSERT INTO collections (id, user_id, content_item_id, content_version, kind, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note)`,
      [entry.id, entry.userId, entry.contentItemId, entry.contentVersion, entry.kind, entry.note ?? null, new Date(entry.createdAt)],
    );
    const existing = (await this.listCollections(input.userId, input.kind)).find(item => item.contentItemId === input.contentItemId);
    return existing ?? entry;
  }

  async saveCorrection(userId: string, attemptId: string, correctedAnswer: unknown, selfCheck?: Record<string, boolean>): Promise<boolean> {
    const [attemptRows] = await this.pool.execute<Array<RowDataPacket & { id: string }>>('SELECT id FROM attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!attemptRows[0]) return false;
    await this.pool.execute(
      `INSERT INTO corrections (id, attempt_id, user_id, corrected_answer_json, self_check_json)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE corrected_answer_json = VALUES(corrected_answer_json), self_check_json = VALUES(self_check_json)`,
      [randomUUID(), attemptId, userId, JSON.stringify(correctedAnswer), selfCheck ? JSON.stringify(selfCheck) : null],
    );
    return true;
  }

  async saveSpellingAttempt(input: { userId: string; contentItemId: string; contentVersion: number; answerText: string; correct: boolean; idempotencyKey: string }) {
    const id = randomUUID();
    try {
      await this.pool.execute(`INSERT INTO spelling_attempts (id, user_id, content_item_id, content_version, answer_text, is_correct, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.userId, input.contentItemId, input.contentVersion, input.answerText, input.correct, input.idempotencyKey]);
      return { id, correct: input.correct, duplicate: false };
    } catch (cause) {
      if (!isDuplicateKey(cause)) throw cause;
      const [rows] = await this.pool.execute<Array<RowDataPacket & { id: string; is_correct: number }>>(`SELECT id, is_correct FROM spelling_attempts WHERE idempotency_key = ? LIMIT 1`, [input.idempotencyKey]);
      return { id: rows[0].id, correct: Boolean(rows[0].is_correct), duplicate: true };
    }
  }

  async getDailyTasks(userId: string, planDate: string, tier: UserAccount['planTier']): Promise<DailyTaskState[]> {
    const definitions = dailyTaskDefinitions(tier);
    for (const task of definitions) {
      await this.pool.execute(
        `INSERT IGNORE INTO daily_task_progress (user_id, plan_date, task_key, target_count, points)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, planDate, task.key, task.target, task.points],
      );
    }
    const due = new Set((await this.listReviews(userId, new Date().toISOString())).map(r => `${r.contentItemId}:${r.skill}`)).size;
    await this.pool.execute(`UPDATE daily_task_progress SET target_count = LEAST(?, completed_count + ?) WHERE user_id = ? AND plan_date = ? AND task_key = 'review'`, [definitions.find(t => t.key === 'review')!.target, due, userId, planDate]);
    const [rows] = await this.pool.execute<Array<RowDataPacket & { task_key: DailyTaskState['key']; target_count: number; completed_count: number; points: number; completed_at: string | Date | null }>>(
      `SELECT task_key, target_count, completed_count, points, completed_at
         FROM daily_task_progress WHERE user_id = ? AND plan_date = ?`,
      [userId, planDate],
    );
    return definitions.map(definition => {
      const row = rows.find(item => item.task_key === definition.key);
      return { ...definition, target: row?.target_count ?? definition.target, completed: row?.completed_count ?? 0, points: row?.points ?? definition.points, completedAt: row?.completed_at ? timestamp(row.completed_at) : undefined };
    });
  }

  async incrementDailyTask(userId: string, planDate: string, taskKey: DailyTaskState['key'], amount: number, tier: UserAccount['planTier']): Promise<DailyTaskState[]> {
    await this.getDailyTasks(userId, planDate, tier);
    await this.pool.execute(
      `UPDATE daily_task_progress
          SET completed_at = IF(target_count > 0 AND completed_count + ? >= target_count, COALESCE(completed_at, UTC_TIMESTAMP(3)), completed_at),
              completed_count = LEAST(target_count, completed_count + ?)
        WHERE user_id = ? AND plan_date = ? AND task_key = ?`,
      [amount, amount, userId, planDate, taskKey],
    );
    const tasks = await this.getDailyTasks(userId, planDate, tier);
    return tasks;
  }

  async saveOpenSubmission(input: Omit<OpenSubmission, 'id' | 'createdAt'>): Promise<OpenSubmission> {
    const [existing] = await this.pool.execute<RowDataPacket[]>(`SELECT id, response_text, self_check_json, created_at FROM open_submissions WHERE user_id = ? AND module = ? AND prompt_id = ? AND BINARY response_text = BINARY ? LIMIT 1`, [input.userId, input.module, input.promptId, input.responseText]);
    if (existing[0]) return { ...input, id: existing[0].id, selfCheck: typeof existing[0].self_check_json === 'string' ? JSON.parse(existing[0].self_check_json) : existing[0].self_check_json, createdAt: timestamp(existing[0].created_at), duplicate: true };
    const entry: OpenSubmission = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.pool.execute(
      `INSERT INTO open_submissions (id, user_id, module, prompt_id, response_text, self_check_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.userId, entry.module, entry.promptId, entry.responseText, JSON.stringify(entry.selfCheck), new Date(entry.createdAt)],
    );
    return entry;
  }

  async getPlanTier(userId: string, planDate: string): Promise<UserAccount['planTier']> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { current_plan_tier: UserAccount['planTier']; pending_plan_tier: UserAccount['planTier'] | null; pending_effective_date: string | null }>>(
      'SELECT current_plan_tier, pending_plan_tier, pending_effective_date FROM user_settings WHERE user_id = ? LIMIT 1',
      [userId],
    );
    const row = rows[0];
    if (!row) return 'standard';
    if (row.pending_plan_tier && row.pending_effective_date && row.pending_effective_date <= planDate) {
      await this.pool.execute(
        `UPDATE user_settings SET current_plan_tier = pending_plan_tier, pending_plan_tier = NULL, pending_effective_date = NULL WHERE user_id = ?`,
        [userId],
      );
      await this.pool.execute('UPDATE profiles SET plan_tier = ? WHERE user_id = ?', [row.pending_plan_tier, userId]);
      return row.pending_plan_tier;
    }
    return row.current_plan_tier;
  }

  async schedulePlan(userId: string, tier: UserAccount['planTier'], effectiveDate: string, examDate?: string): Promise<void> {
    await this.pool.execute(
      `UPDATE user_settings SET pending_plan_tier = ?, pending_effective_date = ?, exam_date = COALESCE(?, exam_date) WHERE user_id = ?`,
      [tier, effectiveDate, examDate ?? null, userId],
    );
    if (examDate) await this.pool.execute('UPDATE profiles SET exam_date = ? WHERE user_id = ?', [examDate, userId]);
  }

  async getCheckin(userId: string, planDate: string) {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(`SELECT * FROM checkins WHERE user_id = ? AND checkin_date = ? LIMIT 1`, [userId, planDate]);
    const row = rows[0];
    if (!row) return undefined;
    return { id: String(row.id), userId: String(row.user_id), checkinDate: String(row.checkin_date).slice(0, 10), planTier: row.plan_tier as UserAccount['planTier'], createdAt: timestamp(row.created_at as string | Date) };
  }

  async createCheckin(userId: string, planDate: string, planTier: UserAccount['planTier']) {
    const previous = await this.getCheckin(userId, planDate);
    if (previous) return previous;
    const checkin = { id: randomUUID(), userId, checkinDate: planDate, planTier, createdAt: new Date().toISOString() };
    try {
      await this.pool.execute(`INSERT INTO checkins (id, user_id, checkin_date, plan_tier, created_at) VALUES (?, ?, ?, ?, ?)`, [checkin.id, userId, planDate, planTier, new Date(checkin.createdAt)]);
      return checkin;
    } catch (cause) {
      if (!isDuplicateKey(cause)) throw cause;
      return (await this.getCheckin(userId, planDate))!;
    }
  }

  async createGameSession(input: { userId: string; gameType: GameType; mode: GameSessionRecord['mode']; questionIds: string[]; questionVersions?: Record<string, number>; rules: GameSessionRecord['rules'] }): Promise<GameSessionRecord> {
    const session: GameSessionRecord = { ...input, id: randomUUID(), status: 'active', score: 0, correctCount: 0, currentStreak: 0, longestStreak: 0, createdAt: new Date().toISOString() };
    await this.pool.execute(
      `INSERT INTO game_sessions (id, user_id, game_type, mode, status, rules_json, question_ids_json, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [session.id, session.userId, session.gameType, session.mode, JSON.stringify(session.rules), encodeSelection(session), new Date(session.createdAt)],
    );
    return session;
  }

  async getGameSession(sessionId: string): Promise<GameSessionRecord | undefined> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT id, user_id, game_type, mode, status, rules_json, question_ids_json, score, correct_count, current_streak, longest_streak, created_at, finished_at
         FROM game_sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    return rows[0] ? mapGameSession(rows[0]) : undefined;
  }

  async submitGameAnswer(input: { gameSessionId: string; userId: string; questionId: string; questionVersion: number; answerIndex: number | null; correct: boolean; idempotencyKey: string }): Promise<{ attempt: GameAttemptRecord; session: GameSessionRecord; duplicate: boolean }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [sessionRows] = await connection.execute<Array<RowDataPacket & Record<string, unknown>>>(
        `SELECT id, user_id, game_type, mode, status, rules_json, question_ids_json, score, correct_count, current_streak, longest_streak, created_at, finished_at
           FROM game_sessions WHERE id = ? FOR UPDATE`,
        [input.gameSessionId],
      );
      if (!sessionRows[0]) throw new Error('GAME_SESSION_NOT_FOUND');
      const session = mapGameSession(sessionRows[0]);
      const [existingRows] = await connection.execute<Array<RowDataPacket & Record<string, unknown>>>(
        `SELECT id, game_session_id, user_id, question_id, question_version, answer_index, is_correct, points, idempotency_key, submitted_at
           FROM game_attempts WHERE idempotency_key = ? OR (game_session_id = ? AND question_id = ?) ORDER BY submitted_at LIMIT 1`,
        [input.idempotencyKey, input.gameSessionId, input.questionId],
      );
      if (existingRows[0]) {
        await connection.commit();
        return { attempt: mapGameAttempt(existingRows[0]), session, duplicate: true };
      }
      const nextStreak = input.correct ? session.currentStreak + 1 : 0;
      const bonus = session.gameType === 'streak' && input.correct && [3, 6, 9].includes(nextStreak) ? 5 : 0;
      const attempt: GameAttemptRecord = { ...input, id: randomUUID(), points: input.correct ? 10 + bonus : 0, submittedAt: new Date().toISOString() };
      await connection.execute(
        `INSERT INTO game_attempts (id, game_session_id, user_id, question_id, question_version, answer_index, is_correct, points, idempotency_key, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [attempt.id, attempt.gameSessionId, attempt.userId, attempt.questionId, attempt.questionVersion, attempt.answerIndex, attempt.correct, attempt.points, attempt.idempotencyKey, new Date(attempt.submittedAt)],
      );
      await connection.execute(
        `UPDATE game_sessions SET score = score + ?, correct_count = correct_count + ?, current_streak = ?, longest_streak = GREATEST(longest_streak, ?) WHERE id = ?`,
        [attempt.points, input.correct ? 1 : 0, nextStreak, nextStreak, input.gameSessionId],
      );
      await connection.commit();
      return { attempt, session: { ...session, score: session.score + attempt.points, correctCount: session.correctCount + (input.correct ? 1 : 0), currentStreak: nextStreak, longestStreak: Math.max(session.longestStreak, nextStreak) }, duplicate: false };
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  async gameAttempts(sessionId: string): Promise<GameAttemptRecord[]> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT id, game_session_id, user_id, question_id, question_version, answer_index, is_correct, points, idempotency_key, submitted_at
         FROM game_attempts WHERE game_session_id = ? ORDER BY submitted_at`,
      [sessionId],
    );
    return rows.map(mapGameAttempt);
  }

  async finishGameSession(sessionId: string): Promise<GameSessionRecord | undefined> {
    await this.pool.execute(`UPDATE game_sessions SET status = 'finished', finished_at = COALESCE(finished_at, UTC_TIMESTAMP(3)) WHERE id = ?`, [sessionId]);
    return this.getGameSession(sessionId);
  }

  async createTeam(input: { name: string; ownerId: string; inviteCode: string; inviteExpiresAt: string }): Promise<TeamRecord> {
    const team: TeamRecord = { ...input, id: randomUUID(), memberLimit: 6, goalTarget: 20, createdAt: new Date().toISOString() };
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO teams (id, name, owner_id, invite_code, invite_expires_at, member_limit, goal_target, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [team.id, team.name, team.ownerId, team.inviteCode, new Date(team.inviteExpiresAt), team.memberLimit, team.goalTarget, new Date(team.createdAt)],
      );
      await connection.execute(`INSERT INTO memberships (team_id, user_id, role, status) VALUES (?, ?, 'owner', 'active')`, [team.id, team.ownerId]);
      await connection.commit();
      return team;
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  async joinTeam(inviteCode: string, userId: string): Promise<TeamRecord | undefined> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Array<RowDataPacket & Record<string, unknown>>>(
        `SELECT id, name, owner_id, invite_code, invite_expires_at, member_limit, goal_target, created_at FROM teams WHERE invite_code = ? FOR UPDATE`,
        [inviteCode],
      );
      if (!rows[0]) { await connection.rollback(); return undefined; }
      const team = mapTeam(rows[0]);
      if (team.inviteExpiresAt <= new Date().toISOString()) { await connection.rollback(); return undefined; }
      const [countRows] = await connection.execute<Array<RowDataPacket & { member_count: number }>>(`SELECT COUNT(*) AS member_count FROM memberships WHERE team_id = ? AND status = 'active'`, [team.id]);
      if (Number(countRows[0].member_count) >= team.memberLimit) { await connection.rollback(); return undefined; }
      await connection.execute(
        `INSERT INTO memberships (team_id, user_id, role, status) VALUES (?, ?, 'member', 'active')
         ON DUPLICATE KEY UPDATE status = 'active', left_at = NULL`,
        [team.id, userId],
      );
      await connection.commit();
      return team;
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  async getTeamOverview(userId: string, weekStart: string): Promise<{ team: TeamRecord; members: Array<{ userId: string; nickname: string; planTier: UserAccount['planTier']; points: number; role: 'owner' | 'member' }> } | undefined> {
    const [teamRows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT t.id, t.name, t.owner_id, t.invite_code, t.invite_expires_at, t.member_limit, t.goal_target, t.created_at
         FROM teams t JOIN memberships m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' LIMIT 1`,
      [userId],
    );
    if (!teamRows[0]) return undefined;
    const team = mapTeam(teamRows[0]);
    const [memberRows] = await this.pool.execute<Array<RowDataPacket & { user_id: string; nickname: string; plan_tier: UserAccount['planTier']; role: 'owner' | 'member'; points: number }>>(
      `SELECT m.user_id, p.nickname, p.plan_tier, m.role, COALESCE(SUM(pl.points), 0) AS points
         FROM memberships m JOIN profiles p ON p.user_id = m.user_id
         LEFT JOIN point_ledger pl ON pl.user_id = m.user_id AND pl.created_at >= ?
        WHERE m.team_id = ? AND m.status = 'active'
        GROUP BY m.user_id, p.nickname, p.plan_tier, m.role ORDER BY points DESC, m.joined_at ASC`,
      [new Date(weekStart), team.id],
    );
    return { team, members: memberRows.map(row => ({ userId: row.user_id, nickname: row.nickname, planTier: row.plan_tier, points: Number(row.points), role: row.role })) };
  }

  async createReaction(teamId: string, senderId: string, receiverId: string, messageKey: string) {
    const reaction = { id: randomUUID(), createdAt: new Date().toISOString() };
    await this.pool.execute(`INSERT INTO reactions (id, team_id, sender_id, receiver_id, message_key, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [reaction.id, teamId, senderId, receiverId, messageKey, new Date(reaction.createdAt)]);
    return reaction;
  }

  async createChallenge(input: Omit<ChallengeRecord, 'id' | 'createdAt' | 'status'>): Promise<ChallengeRecord> {
    const challenge: ChallengeRecord = { ...input, id: randomUUID(), status: 'open', createdAt: new Date().toISOString() };
    await this.pool.execute(
      `INSERT INTO challenges (id, team_id, creator_id, game_type, title, rules_json, question_ids_json, status, deadline_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [challenge.id, challenge.teamId, challenge.creatorId, challenge.gameType, challenge.title, JSON.stringify(challenge.rules), encodeSelection(challenge), new Date(challenge.deadlineAt), new Date(challenge.createdAt)],
    );
    return challenge;
  }

  async listChallenges(teamId: string): Promise<ChallengeRecord[]> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT id, team_id, creator_id, game_type, title, rules_json, question_ids_json, status, deadline_at, created_at FROM challenges WHERE team_id = ? ORDER BY deadline_at DESC`,
      [teamId],
    );
    return rows.map(mapChallenge);
  }

  async getChallenge(challengeId: string): Promise<ChallengeRecord | undefined> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT id, team_id, creator_id, game_type, title, rules_json, question_ids_json, status, deadline_at, created_at FROM challenges WHERE id = ? LIMIT 1`,
      [challengeId],
    );
    return rows[0] ? mapChallenge(rows[0]) : undefined;
  }

  async startChallenge(challengeId: string, userId: string): Promise<{ participation: ChallengeParticipation; game: GameSessionRecord; duplicate: boolean }> {
    const [existingRows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT cp.*, gs.game_type, gs.mode, gs.rules_json, gs.question_ids_json, gs.current_streak, gs.created_at AS game_created_at, gs.finished_at AS game_finished_at
         FROM challenge_participations cp JOIN game_sessions gs ON gs.id = cp.game_session_id WHERE cp.challenge_id = ? AND cp.user_id = ? LIMIT 1`,
      [challengeId, userId],
    );
    if (existingRows[0]) {
      const row = existingRows[0];
      const game = await this.getGameSession(String(row.game_session_id));
      const participation: ChallengeParticipation = { id: String(row.id), challengeId: String(row.challenge_id), userId: String(row.user_id), gameSessionId: String(row.game_session_id), status: row.status as ChallengeParticipation['status'], score: Number(row.score), correctCount: Number(row.correct_count), longestStreak: Number(row.longest_streak), startedAt: timestamp(row.started_at as string | Date), finishedAt: row.finished_at ? timestamp(row.finished_at as string | Date) : undefined };
      return { participation, game: game!, duplicate: true };
    }
    const challenge = await this.getChallenge(challengeId);
    if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');
    const game = await this.createGameSession({ userId, gameType: challenge.gameType, mode: 'challenge', questionIds: challenge.questionIds, questionVersions: challenge.questionVersions, rules: challenge.rules });
    const participation: ChallengeParticipation = { id: randomUUID(), challengeId, userId, gameSessionId: game.id, status: 'active', score: 0, correctCount: 0, longestStreak: 0, startedAt: new Date().toISOString() };
    try {
      await this.pool.execute(
        `INSERT INTO challenge_participations (id, challenge_id, user_id, game_session_id, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)`,
        [participation.id, challengeId, userId, game.id, new Date(participation.startedAt)],
      );
      return { participation, game, duplicate: false };
    } catch (cause) {
      if (!isDuplicateKey(cause)) throw cause;
      return this.startChallenge(challengeId, userId);
    }
  }

  async finishChallengeParticipation(challengeId: string, userId: string, game: GameSessionRecord): Promise<ChallengeParticipation | undefined> {
    await this.pool.execute(
      `UPDATE challenge_participations SET status = 'finished', score = ?, correct_count = ?, longest_streak = ?, finished_at = COALESCE(finished_at, UTC_TIMESTAMP(3)) WHERE challenge_id = ? AND user_id = ?`,
      [game.score, game.correctCount, game.longestStreak, challengeId, userId],
    );
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(`SELECT * FROM challenge_participations WHERE challenge_id = ? AND user_id = ? LIMIT 1`, [challengeId, userId]);
    if (!rows[0]) return undefined;
    const row = rows[0];
    return { id: String(row.id), challengeId: String(row.challenge_id), userId: String(row.user_id), gameSessionId: String(row.game_session_id), status: row.status as ChallengeParticipation['status'], score: Number(row.score), correctCount: Number(row.correct_count), longestStreak: Number(row.longest_streak), startedAt: timestamp(row.started_at as string | Date), finishedAt: row.finished_at ? timestamp(row.finished_at as string | Date) : undefined };
  }

  async setUserRole(userId: string, role: UserRole): Promise<UserAccount | undefined> {
    await this.pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    return this.findUserById(userId);
  }

  async createAsset(input: Omit<AssetRecord, 'id' | 'createdAt'>): Promise<AssetRecord> {
    const asset: AssetRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.pool.execute(
      `INSERT INTO assets (id, owner_id, object_key, original_name, mime_type, byte_size, sha256, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asset.id, asset.ownerId, asset.objectKey, asset.originalName, asset.mimeType, asset.byteSize, asset.sha256, asset.visibility, new Date(asset.createdAt)],
    );
    return asset;
  }

  async getAsset(assetId: string): Promise<AssetRecord | undefined> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(`SELECT * FROM assets WHERE id = ? LIMIT 1`, [assetId]);
    const row = rows[0];
    if (!row) return undefined;
    return { id: String(row.id), ownerId: String(row.owner_id), objectKey: String(row.object_key), originalName: String(row.original_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), sha256: String(row.sha256), visibility: row.visibility as AssetRecord['visibility'], createdAt: timestamp(row.created_at as string | Date) };
  }

  async createImport(ownerId: string, assetId: string): Promise<ImportRecord> {
    const now = new Date().toISOString();
    const record: ImportRecord = { id: randomUUID(), ownerId, assetId, status: 'uploaded', errors: [], createdAt: now, updatedAt: now };
    await this.pool.execute(
      `INSERT INTO imports (id, owner_id, asset_id, status, error_json, created_at, updated_at) VALUES (?, ?, ?, 'uploaded', JSON_ARRAY(), ?, ?)`,
      [record.id, ownerId, assetId, new Date(now), new Date(now)],
    );
    return record;
  }

  async listImports(userId: string, all: boolean): Promise<Array<{ import: ImportRecord; asset: AssetRecord }>> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT i.id AS import_id, i.owner_id, i.asset_id, i.status, i.error_json, i.reviewer_id, i.created_at AS import_created_at, i.updated_at,
              a.object_key, a.original_name, a.mime_type, a.byte_size, a.sha256, a.visibility, a.created_at AS asset_created_at
         FROM imports i JOIN assets a ON a.id = i.asset_id
        WHERE (? = 1 OR i.owner_id = ?) ORDER BY i.created_at DESC`,
      [all ? 1 : 0, userId],
    );
    return rows.map(row => ({
      import: { id: String(row.import_id), ownerId: String(row.owner_id), assetId: String(row.asset_id), status: row.status as ImportRecord['status'], errors: parseJson(row.error_json as string | string[]), reviewerId: row.reviewer_id ? String(row.reviewer_id) : undefined, createdAt: timestamp(row.import_created_at as string | Date), updatedAt: timestamp(row.updated_at as string | Date) },
      asset: { id: String(row.asset_id), ownerId: String(row.owner_id), objectKey: String(row.object_key), originalName: String(row.original_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), sha256: String(row.sha256), visibility: row.visibility as AssetRecord['visibility'], createdAt: timestamp(row.asset_created_at as string | Date) },
    }));
  }

  async updateImport(importId: string, status: ImportRecord['status'], reviewerId?: string, errors: string[] = []): Promise<ImportRecord | undefined> {
    await this.pool.execute(
      `UPDATE imports SET status = ?, reviewer_id = COALESCE(?, reviewer_id), error_json = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [status, reviewerId ?? null, JSON.stringify(errors), importId],
    );
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(`SELECT * FROM imports WHERE id = ? LIMIT 1`, [importId]);
    if (!rows[0]) return undefined;
    const row = rows[0];
    return { id: String(row.id), ownerId: String(row.owner_id), assetId: String(row.asset_id), status: row.status as ImportRecord['status'], errors: parseJson(row.error_json as string | string[]), reviewerId: row.reviewer_id ? String(row.reviewer_id) : undefined, createdAt: timestamp(row.created_at as string | Date), updatedAt: timestamp(row.updated_at as string | Date) };
  }

  async createContent(input: { kind: string; ownerId?: string; visibility: ContentRecord['visibility']; payload: Record<string, unknown> }): Promise<ContentRecord> {
    const record: ContentRecord = { id: randomUUID(), ...input, version: 1, status: 'draft', createdAt: new Date().toISOString() };
    const versionId = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`INSERT INTO content_items (id, kind, owner_id, visibility, created_at) VALUES (?, ?, ?, ?, ?)`, [record.id, record.kind, record.ownerId ?? null, record.visibility, new Date(record.createdAt)]);
      await connection.execute(`INSERT INTO content_versions (id, content_item_id, version, payload_json, status, created_at) VALUES (?, ?, 1, ?, 'draft', ?)`, [versionId, record.id, JSON.stringify(record.payload), new Date(record.createdAt)]);
      if (record.ownerId) await connection.execute(`INSERT INTO publication_events (id, content_item_id, content_version, action, actor_user_id) VALUES (?, ?, 1, 'created', ?)`, [randomUUID(), record.id, record.ownerId]);
      await connection.commit();
      return record;
    } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
  }

  async createContentVersion(contentItemId: string, payload: Record<string, unknown>): Promise<ContentRecord | undefined> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [itemRows] = await connection.execute<Array<RowDataPacket & { id: string; kind: string; owner_id: string | null; visibility: ContentRecord['visibility'] }>>(`SELECT id, kind, owner_id, visibility FROM content_items WHERE id = ? FOR UPDATE`, [contentItemId]);
      if (!itemRows[0]) { await connection.rollback(); return undefined; }
      const [versionRows] = await connection.execute<Array<RowDataPacket & { next_version: number }>>(`SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM content_versions WHERE content_item_id = ?`, [contentItemId]);
      const version = Number(versionRows[0].next_version);
      const createdAt = new Date().toISOString();
      await connection.execute(`INSERT INTO content_versions (id, content_item_id, version, payload_json, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)`, [randomUUID(), contentItemId, version, JSON.stringify(payload), new Date(createdAt)]);
      await connection.commit();
      const item = itemRows[0];
      return { id: contentItemId, kind: item.kind, ownerId: item.owner_id ?? undefined, visibility: item.visibility, version, payload, status: 'draft', createdAt };
    } catch (cause) { await connection.rollback(); throw cause; }
    finally { connection.release(); }
  }

  async listContent(): Promise<ContentRecord[]> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT ci.id, ci.kind, ci.owner_id, ci.visibility, cv.version, cv.payload_json, cv.status, cv.created_at
         FROM content_items ci JOIN content_versions cv ON cv.content_item_id = ci.id
         JOIN (SELECT content_item_id, MAX(version) AS version FROM content_versions GROUP BY content_item_id) latest
           ON latest.content_item_id = cv.content_item_id AND latest.version = cv.version
        ORDER BY cv.created_at DESC`,
    );
    return rows.map(row => ({ id: String(row.id), kind: String(row.kind), ownerId: row.owner_id ? String(row.owner_id) : undefined, visibility: row.visibility as ContentRecord['visibility'], version: Number(row.version), payload: parseJson(row.payload_json as string | Record<string, unknown>), status: row.status as ContentRecord['status'], createdAt: timestamp(row.created_at as string | Date) }));
  }

  async listPublishedContent(kind: string, userId?: string): Promise<ContentRecord[]> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT ci.id, ci.kind, ci.owner_id, ci.visibility, cv.version, cv.payload_json, cv.status, cv.created_at
       FROM content_items ci JOIN content_versions cv ON cv.content_item_id = ci.id
       WHERE ci.kind = ? AND (ci.visibility = 'public' OR ci.owner_id = ?) AND cv.status = 'published'
       AND cv.version = (SELECT MAX(v.version) FROM content_versions v WHERE v.content_item_id = ci.id AND v.status = 'published')
       ORDER BY ci.id`, [kind, userId ?? null]);
    return rows.map(row => ({ id: String(row.id), kind: String(row.kind), ownerId: row.owner_id ? String(row.owner_id) : undefined, visibility: row.visibility as ContentRecord['visibility'], version: Number(row.version), payload: parseJson(row.payload_json as string | Record<string, unknown>), status: row.status as ContentRecord['status'], createdAt: timestamp(row.created_at as string | Date) }));
  }

  async getContentVersion(id: string, version: number): Promise<ContentRecord | undefined> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(
      `SELECT ci.id, ci.kind, ci.owner_id, ci.visibility, cv.version, cv.payload_json, cv.status, cv.created_at
       FROM content_items ci JOIN content_versions cv ON cv.content_item_id = ci.id WHERE ci.id = ? AND cv.version = ?`, [id, version]);
    const row = rows[0];
    return row ? { id: String(row.id), kind: String(row.kind), ownerId: row.owner_id ? String(row.owner_id) : undefined, visibility: row.visibility as ContentRecord['visibility'], version: Number(row.version), payload: parseJson(row.payload_json as string | Record<string, unknown>), status: row.status as ContentRecord['status'], createdAt: timestamp(row.created_at as string | Date) } : undefined;
  }

  async updateContentStatus(contentItemId: string, version: number, status: ContentRecord['status'], actorUserId: string, reason?: string): Promise<ContentRecord | undefined> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM content_items WHERE id = ? FOR UPDATE', [contentItemId]);
      const [rows] = await connection.execute<RowDataPacket[]>('SELECT version FROM content_versions WHERE content_item_id = ? AND version = ?', [contentItemId, version]);
      if (!rows.length) { await connection.rollback(); return undefined; }
      if (status === 'published' || status === 'withdrawn') await connection.execute("UPDATE content_versions SET status = 'withdrawn' WHERE content_item_id = ? AND status = 'published'", [contentItemId]);
      await connection.execute('UPDATE content_versions SET status = ? WHERE content_item_id = ? AND version = ?', [status, contentItemId, version]);
      const action = status === 'published' ? 'published' : status === 'withdrawn' ? 'withdrawn' : 'submitted';
      await connection.execute(`INSERT INTO publication_events (id, content_item_id, content_version, action, actor_user_id, reason) VALUES (?, ?, ?, ?, ?, ?)`, [randomUUID(), contentItemId, version, action, actorUserId, reason ?? null]);
      await connection.commit();
    } catch (cause) { await connection.rollback(); throw cause; }
    finally { connection.release(); }
    return this.getContentVersion(contentItemId, version);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
