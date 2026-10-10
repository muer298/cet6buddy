export type SessionMode = 'practice' | 'challenge';
export type SessionStatus = 'active' | 'finished';
export type UserRole = 'learner' | 'editor' | 'admin';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  status: 'active' | 'disabled';
  nickname: string;
  planTier: 'light' | 'standard' | 'custom';
  examDate?: string;
  timezone: string;
  createdAt: string;
}

export interface PasswordCredential {
  user: UserAccount;
  passwordHash: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface ServerQuestion {
  id: string;
  version: number;
  word: string;
  phonetic: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  contentItemId?: string;
  source?: string;
  passage?: string;
  audioUrl?: string;
}

export interface PublicQuestion extends Omit<ServerQuestion, 'correctIndex' | 'explanation'> {}

export interface StudySession {
  id: string;
  userId: string;
  source: string;
  mode: SessionMode;
  status: SessionStatus;
  questionIds: string[];
  questionVersions?: Record<string, number>;
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

export type ReviewSkill = 'meaning' | 'spelling' | 'listening' | 'reading' | 'output';

export interface ReviewState {
  userId: string;
  contentItemId: string;
  skill: ReviewSkill;
  dueAt: string;
  intervalDays: number;
  updatedAt: string;
  payload?: Record<string, unknown>;
}

export interface CollectionEntry {
  id: string;
  userId: string;
  contentItemId: string;
  contentVersion: number;
  kind: string;
  note?: string;
  createdAt: string;
}

export interface DailyTaskState {
  key: 'review' | 'new_words' | 'input' | 'output' | 'game';
  title: string;
  required: boolean;
  target: number;
  completed: number;
  points: number;
  completedAt?: string;
}

export interface OpenSubmission {
  duplicate?: boolean;
  id: string;
  userId: string;
  module: 'translation' | 'writing';
  promptId: string;
  responseText: string;
  selfCheck: Record<string, boolean>;
  createdAt: string;
}

export type GameType = 'root-chain' | 'flash' | 'streak';

export interface GameSessionRecord {
  id: string;
  userId: string;
  gameType: GameType;
  mode: 'practice' | 'challenge';
  status: 'active' | 'finished';
  questionIds: string[];
  questionVersions?: Record<string, number>;
  rules: { questionCount: number; secondsPerQuestion: number | null; ruleVersion: number };
  score: number;
  correctCount: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  finishedAt?: string;
}

export interface GameAttemptRecord {
  id: string;
  gameSessionId: string;
  userId: string;
  questionId: string;
  questionVersion: number;
  answerIndex: number | null;
  correct: boolean;
  points: number;
  idempotencyKey: string;
  submittedAt: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  inviteExpiresAt: string;
  memberLimit: number;
  goalTarget: number;
  createdAt: string;
}

export interface ChallengeRecord {
  id: string;
  teamId: string;
  creatorId: string;
  gameType: GameType;
  title: string;
  questionIds: string[];
  questionVersions?: Record<string, number>;
  rules: GameSessionRecord['rules'];
  status: 'open' | 'closed';
  deadlineAt: string;
  createdAt: string;
}

export interface ChallengeParticipation {
  id: string;
  challengeId: string;
  userId: string;
  gameSessionId: string;
  status: 'active' | 'finished';
  score: number;
  correctCount: number;
  longestStreak: number;
  startedAt: string;
  finishedAt?: string;
}

export interface AssetRecord {
  id: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  visibility: 'private' | 'team' | 'public';
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  ownerId: string;
  assetId: string;
  status: 'uploaded' | 'draft' | 'validating' | 'review' | 'published' | 'withdrawn';
  errors: string[];
  reviewerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentRecord {
  id: string;
  kind: string;
  ownerId?: string;
  visibility: 'private' | 'team' | 'public';
  version: number;
  payload: Record<string, unknown>;
  status: 'draft' | 'review' | 'published' | 'withdrawn';
  createdAt: string;
}
