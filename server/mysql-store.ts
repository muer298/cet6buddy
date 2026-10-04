import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { PointEntry, StoredAttempt, StudySession } from './types.ts';
import type { StudyStore } from './store.ts';

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

function timestamp(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized).toISOString();
}

function jsonArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : JSON.parse(value) as string[];
}

function mapSession(row: SessionRow): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    mode: row.mode,
    status: row.status,
    questionIds: jsonArray(row.question_ids_json),
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
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
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
      [session.id, session.userId, session.source, session.mode, session.status, JSON.stringify(session.questionIds), new Date(session.createdAt)],
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
    const entry: PointEntry = { id: randomUUID(), userId, rewardKey, points, reason, createdAt: new Date().toISOString() };
    try {
      await this.pool.execute(
        `INSERT INTO point_ledger (id, user_id, points, reason, reward_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.userId, entry.points, entry.reason, entry.rewardKey, new Date(entry.createdAt)],
      );
      return { entry, awarded: true };
    } catch (cause) {
      if (!isDuplicateKey(cause)) throw cause;
      const [rows] = await this.pool.execute<PointRow[]>(
        `SELECT id, user_id, points, reward_key, reason, created_at
           FROM point_ledger WHERE reward_key = ? LIMIT 1`,
        [rewardKey],
      );
      if (!rows[0]) throw cause;
      return { entry: mapPoint(rows[0]), awarded: false };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
