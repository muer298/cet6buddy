export type Route =
  | 'today' | 'study' | 'games' | 'team' | 'me'
  | 'word' | 'listening' | 'reading' | 'translation' | 'writing'
  | 'rootgame' | 'flashgame' | 'streakgame' | 'challenge'
  | 'upload' | 'login' | 'onboarding' | 'result' | 'admin';

export type SyncState = 'synced' | 'submitting' | 'pending' | 'failed';

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: 'learner' | 'editor' | 'admin';
  mustChangePassword: boolean;
  status: 'active' | 'disabled';
  nickname: string;
  planTier: 'light' | 'standard' | 'custom';
  examDate?: string;
  timezone: string;
}

export interface StudyTask {
  id: string;
  title: string;
  description: string;
  progress: number;
  total: number;
  points: number;
  route: Route;
  required: boolean;
}

export interface Question {
  id: string;
  version: number;
  word: string;
  phonetic: string;
  prompt: string;
  options: string[];
  correctIndex?: number;
  hint?: string;
}

export interface Attempt {
  questionId: string;
  questionVersion: number;
  answerIndex: number;
  correct: boolean;
  idempotencyKey: string;
  submittedAt: string;
}

export interface SessionResult {
  attempts: Attempt[];
  correct: number;
  total: number;
  score: number;
  needsReview: string[];
  reward?: {
    points: number;
    awarded: boolean;
    reason?: string;
  };
}
