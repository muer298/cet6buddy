import type { Question } from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? '请求失败，请稍后重试。', payload.error?.code ?? 'REQUEST_FAILED', response.status);
  }
  return payload;
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

export function createStudySession(): Promise<StudySessionResponse> {
  return request('/api/study/sessions', {
    method: 'POST',
    body: JSON.stringify({ source: 'due_reviews', mode: 'practice' }),
  });
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

export function finishStudySession(sessionId: string): Promise<FinishResponse> {
  return request(`/api/sessions/${sessionId}/finish`, { method: 'POST', body: '{}' });
}
