import type { CurrentUser, Question } from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), ...init?.headers },
  });
  const payload = await response.json() as T & { error?: { code?: string; message?: string; details?: { errors?: string[] } } };
  if (!response.ok) {
    throw new ApiError([payload.error?.message ?? '请求失败，请稍后重试。', ...(payload.error?.details?.errors ?? [])].join('；'), payload.error?.code ?? 'REQUEST_FAILED', response.status);
  }
  return payload;
}

export async function passwordLogin(identifier: string, password: string): Promise<{ user: CurrentUser }> {
  return request('/api/auth/password/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ user: CurrentUser }> {
  return request('/api/auth/password/change', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return (await request<{ user: CurrentUser }>('/api/me')).user;
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', body: '{}' });
}

export interface TodayPlanResponse {
  earned_points: number;
  server_date: string;
  timezone: string;
  plan_tier: 'light' | 'standard' | 'custom';
  tasks: Array<{ id: string; key: string; title: string; required: boolean; target: number; completed: number; points: number; completedAt?: string }>;
}

export function getTodayPlan(): Promise<TodayPlanResponse> {
  return request('/api/me/plan');
}

export interface LearningSummary {
  practicedWords: number; todayPoints: number; reviews: number; collections: number; mistakes: number;
  planTier: CurrentUser['planTier']; modules: Record<string, number>;
}
export interface LearningItem {
  id: string; contentId: string; kind: string; title: string; version?: number; available: boolean; date: string; skill?: string; note?: string; question?: Question;
}
export interface LearningList { items: LearningItem[]; pagination: { page: number; pages: number; total: number } }
export const getLearningSummary = () => request<LearningSummary>('/api/me/learning-summary');
export const getLearningItems = (filter: string, page = 1) => request<LearningList>(`/api/me/learning-items?filter=${filter}&page=${page}`);
export const correctAttempt = (id: string, answer: number) => request(`/api/attempts/${id}/corrections`, { method: 'POST', body: JSON.stringify({ answer }) });
export interface OutputContent { id: string; version: number; prompt: string; references: string[]; source: string }
export const getOutputContent = (kind: string, content = '') => request<{ items: OutputContent[] }>(`/api/learning/output?kind=${kind}&content=${encodeURIComponent(content)}`);

export function updatePlan(planTier: TodayPlanResponse['plan_tier'], examDate?: string): Promise<{ effective_date: string }> {
  return request('/api/me/plan', { method: 'PUT', body: JSON.stringify({ plan_tier: planTier, exam_date: examDate }) });
}

export function completeInputTask(): Promise<{ task: TodayPlanResponse['tasks'][number]; reward: null | { points: number; awarded: boolean } }> {
  return request('/api/me/tasks/input/complete', { method: 'POST', body: '{}' });
}

export function createCheckin(): Promise<{ checkin: { checkinDate: string } }> {
  return request('/api/me/checkin', { method: 'POST', body: '{}' });
}

export function getDueReviews(): Promise<{ reviews: Array<Record<string, unknown>> }> {
  return request('/api/me/reviews');
}

export function addCollection(contentItemId: string, contentVersion: number, kind: string, note?: string): Promise<unknown> {
  return request('/api/collections', { method: 'POST', body: JSON.stringify({ content_item_id: contentItemId, content_version: contentVersion, kind, note }) });
}

export function saveOpenSubmission(module: 'translation' | 'writing', promptId: string, responseText: string, selfCheck: Record<string, boolean>): Promise<{ submission: { id: string }; reward: null | { points: number; awarded: boolean } }> {
  return request('/api/open-submissions', { method: 'POST', body: JSON.stringify({ module, prompt_id: promptId, response_text: responseText, self_check: selfCheck }) });
}

export interface StudySessionResponse {
  session: {
    id: string;
    source: string;
    mode: 'practice' | 'challenge';
    status: 'active' | 'finished';
    questions: Question[];
  };
}

export interface AnswerResponse {
  accepted: boolean;
  duplicate: boolean;
  attempt_id: string;
  server_status: 'confirmed';
  feedback: null | {
    correct: boolean;
    correct_answer: number;
    explanation: string;
  };
}

export interface FinishResponse {
  session_id: string;
  status: 'finished';
  result: { answered: number; total: number; correct: number; score: number };
  reward: { points: number; awarded: boolean; reward_key?: string; reason?: string };
}

export function createStudySession(source = 'new_words', contentItemId?: string): Promise<StudySessionResponse> {
  return request('/api/study/sessions', {
    method: 'POST',
    body: JSON.stringify({ source, content_item_id: contentItemId, mode: 'practice' }),
  });
}

export function resumeStudySession(sessionId: string): Promise<StudySessionResponse & { attempts: Array<{ questionId: string }> }> {
  return request(`/api/sessions/${sessionId}/resume`);
}

export function submitSessionAnswer(sessionId: string, question: Question, answerIndex: number, idempotencyKey: string): Promise<AnswerResponse> {
  return request(`/api/sessions/${sessionId}/answers`, {
    method: 'POST',
    body: JSON.stringify({
      question_id: question.id,
      question_version: question.version,
      answer: answerIndex,
      idempotency_key: idempotencyKey,
    }),
  });
}

export function submitSpellingAttempt(question: Question, answerText: string, idempotencyKey: string, sessionId?: string): Promise<{ feedback: { correct: boolean; correct_answer: string }; duplicate: boolean }> {
  return request('/api/spelling-attempts', { method: 'POST', body: JSON.stringify({ content_item_id: question.id, content_version: question.version, answer_text: answerText, idempotency_key: idempotencyKey, session_id: sessionId }) });
}

export function finishStudySession(sessionId: string): Promise<FinishResponse> {
  return request(`/api/sessions/${sessionId}/finish`, { method: 'POST', body: '{}' });
}

export type GameType = 'root-chain' | 'flash' | 'streak';

export interface GameSessionResponse {
  session: {
    id: string;
    gameType: GameType;
    status: 'active' | 'finished';
    score: number;
    currentStreak: number;
    longestStreak: number;
    rules: { questionCount: number; secondsPerQuestion: number | null };
    questions: Question[];
  };
}

export function createGameSession(gameType: GameType, secondsPerQuestion?: number): Promise<GameSessionResponse> {
  return request('/api/games/sessions', { method: 'POST', body: JSON.stringify({ game_type: gameType, seconds_per_question: secondsPerQuestion }) });
}

export function submitGameAnswer(sessionId: string, question: Question, answer: number | null, idempotencyKey: string): Promise<{ feedback: AnswerResponse['feedback']; points: number; score: number; streak: number; timed_out: boolean }> {
  return request(`/api/game-sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer, idempotency_key: idempotencyKey }) });
}

export function finishGame(sessionId: string): Promise<{ result: { correct: number; score: number; longest_streak: number }; reward: null | { points: number; awarded: boolean } }> {
  return request(`/api/game-sessions/${sessionId}/finish`, { method: 'POST', body: '{}' });
}

export interface TeamOverview {
  team: { id: string; name: string; inviteCode: string; inviteExpiresAt: string; goalTarget: number };
  members: Array<{ userId: string; nickname: string; planTier: 'light' | 'standard' | 'custom'; points: number; role: 'owner' | 'member' }>;
}

export function getMyTeam(): Promise<{ overview?: TeamOverview }> {
  return request('/api/teams/me');
}

export function createTeam(name: string): Promise<{ team: TeamOverview['team'] }> {
  return request('/api/teams', { method: 'POST', body: JSON.stringify({ name }) });
}

export function joinTeam(inviteCode: string): Promise<{ team: TeamOverview['team'] }> {
  return request('/api/teams/join', { method: 'POST', body: JSON.stringify({ invite_code: inviteCode }) });
}

export function sendTeamReaction(teamId: string, receiverId: string): Promise<{ reaction: { id: string } }> {
  return request(`/api/teams/${teamId}/reactions`, { method: 'POST', body: JSON.stringify({ receiver_id: receiverId, message_key: 'keep-going' }) });
}

export interface ChallengeSummary {
  id: string;
  title: string;
  gameType: GameType;
  status: 'open' | 'closed';
  deadlineAt: string;
}

export function getChallenges(): Promise<{ challenges: ChallengeSummary[] }> {
  return request('/api/challenges');
}

export function createChallenge(gameType: GameType, title: string): Promise<{ challenge: ChallengeSummary }> {
  return request('/api/challenges', { method: 'POST', body: JSON.stringify({ game_type: gameType, title }) });
}

export function startChallenge(challengeId: string): Promise<{ session: GameSessionResponse['session']; duplicate: boolean }> {
  return request(`/api/challenges/${challengeId}/start`, { method: 'POST', body: '{}' });
}

export function submitChallengeAnswer(challengeId: string, question: Question, answer: number, idempotencyKey: string): Promise<{ feedback: null; accepted: boolean }> {
  return request(`/api/challenges/${challengeId}/answers`, { method: 'POST', body: JSON.stringify({ question_id: question.id, question_version: question.version, answer, idempotency_key: idempotencyKey }) });
}

export function finishChallenge(challengeId: string): Promise<{ submitted: boolean; revealed: boolean }> {
  return request(`/api/challenges/${challengeId}/finish`, { method: 'POST', body: '{}' });
}

export interface ImportItem {
  import: { id: string; status: 'uploaded' | 'draft' | 'validating' | 'review' | 'published' | 'withdrawn'; errors: string[]; createdAt: string };
  asset: { id: string; originalName: string; mimeType: string; byteSize: number; visibility: 'private' | 'team' | 'public' };
}

export async function uploadPrivateFile(file: File): Promise<ImportItem> {
  const form = new FormData();
  form.set('file', file);
  try {
    const result = await request<{ asset: ImportItem['asset']; import: ImportItem['import'] }>('/api/uploads', { method: 'POST', body: form });
    return { asset: result.asset, import: result.import };
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.code !== 'LOCAL_UPLOAD_DISABLED') throw cause;
  }

  const grant = await request<{
    object_key: string; bucket: string; region: string;
    credentials: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string };
    start_time: number; expired_time: number;
  }>('/api/uploads/credentials', { method: 'POST', body: JSON.stringify({ file_name: file.name, mime_type: file.type, byte_size: file.size }) });
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
  const { default: COS } = await import('cos-js-sdk-v5');
  const client = new COS({ SecretId: grant.credentials.tmpSecretId, SecretKey: grant.credentials.tmpSecretKey, SecurityToken: grant.credentials.sessionToken, StartTime: grant.start_time, ExpiredTime: grant.expired_time });
  await new Promise<void>((resolve, reject) => client.putObject({ Bucket: grant.bucket, Region: grant.region, Key: grant.object_key, Body: file, ContentType: file.type, Headers: { 'x-cos-meta-sha256': digest } }, error => error ? reject(error) : resolve()));
  const result = await request<{ asset: ImportItem['asset']; import: ImportItem['import'] }>('/api/uploads/confirm', { method: 'POST', body: JSON.stringify({ object_key: grant.object_key, original_name: file.name, mime_type: file.type, byte_size: file.size, sha256: digest }) });
  return { asset: result.asset, import: result.import };
}

export function getImports(all = false): Promise<{ imports: ImportItem[] }> {
  return request(`/api/imports${all ? '?all=true' : ''}`);
}

export function updateImportStatus(importId: string, status: ImportItem['import']['status'], errors: string[] = []): Promise<{ import: ImportItem['import'] }> {
  return request(`/api/admin/imports/${importId}/status`, { method: 'POST', body: JSON.stringify({ status, errors }) });
}

export interface ManagedContent {
  id: string;
  kind: string;
  version: number;
  visibility: 'private' | 'team' | 'public';
  status: 'draft' | 'review' | 'published' | 'withdrawn';
  payload: Record<string, unknown>;
  createdAt: string;
}

export function getManagedContent(page = 1): Promise<{ content: ManagedContent[]; pagination: { page: number; pages: number; total: number } }> {
  return request(`/api/admin/content?page=${page}&page_size=20`);
}

export function createManagedContent(kind: string, payload: Record<string, unknown>, visibility = 'private'): Promise<{ content: ManagedContent; validation_errors: string[] }> {
  return request('/api/admin/content', { method: 'POST', body: JSON.stringify({ kind, visibility, payload }) });
}

export function createManagedContentVersion(id: string, payload: Record<string, unknown>): Promise<{ content: ManagedContent; validation_errors: string[] }> {
  return request(`/api/admin/content/${id}/versions`, { method: 'POST', body: JSON.stringify({ payload }) });
}

export function setManagedContentStatus(contentId: string, action: 'publish' | 'withdraw'): Promise<{ content: ManagedContent }> {
  return request(`/api/admin/content/${contentId}/${action}`, { method: 'POST', body: '{}' });
}

export interface ManagedUser extends CurrentUser {
  createdAt: string;
}

export function getManagedUsers(): Promise<{ users: ManagedUser[] }> {
  return request('/api/admin/users');
}

export function createManagedUser(input: { username: string; email: string; nickname: string; role: CurrentUser['role']; initialPassword?: string }): Promise<{ user: ManagedUser; temporary_password: string }> {
  return request('/api/admin/users', { method: 'POST', body: JSON.stringify({
    username: input.username, email: input.email, nickname: input.nickname, role: input.role, initial_password: input.initialPassword,
  }) });
}

export function resetManagedUserPassword(userId: string, temporaryPassword?: string): Promise<{ user: ManagedUser; temporary_password: string }> {
  return request(`/api/admin/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ temporary_password: temporaryPassword }) });
}
