import { randomUUID } from 'node:crypto';
import type { PointEntry, StoredAttempt, StudySession } from './types.ts';

export interface StudyStore {
  createSession(input: Omit<StudySession, 'id' | 'createdAt' | 'status'>): Promise<StudySession>;
  getSession(sessionId: string): Promise<StudySession | undefined>;
  saveAttempt(input: Omit<StoredAttempt, 'id' | 'submittedAt'>): Promise<{ attempt: StoredAttempt; duplicate: boolean }>;
  attemptsForSession(sessionId: string): Promise<StoredAttempt[]>;
  finishSession(sessionId: string): Promise<StudySession | undefined>;
  awardPoints(userId: string, rewardKey: string, points: number, reason: string): Promise<{ entry: PointEntry; awarded: boolean }>;
  close?(): Promise<void>;
}

export class InMemoryStore implements StudyStore {
  readonly sessions = new Map<string, StudySession>();
  readonly attempts = new Map<string, StoredAttempt>();
  readonly attemptsByIdempotency = new Map<string, StoredAttempt>();
  readonly attemptBySessionQuestion = new Map<string, StoredAttempt>();
  readonly pointLedger = new Map<string, PointEntry>();

  async createSession(input: Omit<StudySession, 'id' | 'createdAt' | 'status'>): Promise<StudySession> {
    const session: StudySession = { ...input, id: randomUUID(), status: 'active', createdAt: new Date().toISOString() };
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<StudySession | undefined> {
    return this.sessions.get(sessionId);
  }

  async saveAttempt(input: Omit<StoredAttempt, 'id' | 'submittedAt'>): Promise<{ attempt: StoredAttempt; duplicate: boolean }> {
    const byKey = this.attemptsByIdempotency.get(input.idempotencyKey);
    if (byKey) return { attempt: byKey, duplicate: true };

    const questionKey = `${input.sessionId}:${input.questionId}`;
    const firstAnswer = this.attemptBySessionQuestion.get(questionKey);
    if (firstAnswer) return { attempt: firstAnswer, duplicate: true };

    const attempt: StoredAttempt = { ...input, id: randomUUID(), submittedAt: new Date().toISOString() };
    this.attempts.set(attempt.id, attempt);
    this.attemptsByIdempotency.set(attempt.idempotencyKey, attempt);
    this.attemptBySessionQuestion.set(questionKey, attempt);
    return { attempt, duplicate: false };
  }

  async attemptsForSession(sessionId: string): Promise<StoredAttempt[]> {
    return [...this.attempts.values()].filter(attempt => attempt.sessionId === sessionId);
  }

  async finishSession(sessionId: string): Promise<StudySession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.status === 'active') {
      session.status = 'finished';
      session.finishedAt = new Date().toISOString();
    }
    return session;
  }

  async awardPoints(userId: string, rewardKey: string, points: number, reason: string): Promise<{ entry: PointEntry; awarded: boolean }> {
    const previous = this.pointLedger.get(rewardKey);
    if (previous) return { entry: previous, awarded: false };
    const entry: PointEntry = { id: randomUUID(), userId, rewardKey, points, reason, createdAt: new Date().toISOString() };
    this.pointLedger.set(rewardKey, entry);
    return { entry, awarded: true };
  }
}
