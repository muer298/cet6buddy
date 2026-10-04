export type SessionMode = 'practice' | 'challenge';
export type SessionStatus = 'active' | 'finished';

export interface ServerQuestion {
  id: string;
  version: number;
  word: string;
  phonetic: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface PublicQuestion extends Omit<ServerQuestion, 'correctIndex' | 'explanation'> {}

export interface StudySession {
  id: string;
  userId: string;
  source: string;
  mode: SessionMode;
  status: SessionStatus;
  questionIds: string[];
  createdAt: string;
  finishedAt?: string;
}

export interface StoredAttempt {
  id: string;
  sessionId: string;
  userId: string;
  questionId: string;
  questionVersion: number;
  answerIndex: number;
  correct: boolean;
  idempotencyKey: string;
  submittedAt: string;
}

export interface PointEntry {
  id: string;
  userId: string;
  points: number;
  rewardKey: string;
  reason: string;
  createdAt: string;
}
