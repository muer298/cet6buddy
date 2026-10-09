import { randomInt } from 'node:crypto';
import { questionById } from './data.ts';
import type { StudyStore } from './store.ts';
import type { ContentRecord, PublicQuestion, ServerQuestion } from './types.ts';

export interface QuestionSelection {
  questionIds: string[];
  questionVersions?: Record<string, number>;
}

// Store version references in the existing JSON column; old array-shaped rows remain readable.
export function decodeSelection(value: unknown): QuestionSelection {
  const decoded = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(decoded)) return { questionIds: decoded };
  return decoded as QuestionSelection;
}

export function encodeSelection(value: QuestionSelection): string {
  return JSON.stringify({ questionIds: value.questionIds, questionVersions: value.questionVersions });
}

export function freezeQuestions(questions: ServerQuestion[]): QuestionSelection {
  return { questionIds: questions.map(q => q.id), questionVersions: Object.fromEntries(questions.map(q => [q.id, q.version])) };
}

export function publicQuestion(question: ServerQuestion): PublicQuestion {
  const { correctIndex: _answer, explanation: _explanation, ...safe } = question;
  return safe;
}

function choiceErrors(payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) errors.push('缺少题干 prompt');
  if (!Array.isArray(payload.options) || payload.options.length < 2 || payload.options.length > 6 || payload.options.some(option => typeof option !== 'string' || !option.trim()) || new Set(payload.options).size !== payload.options.length) errors.push('options 需为 2–6 个不重复的非空选项');
  const answer = payload.correct_index;
  if (!Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= (Array.isArray(payload.options) ? payload.options.length : 0)) errors.push('correct_index 必须是从 0 开始的有效选项序号');
  if (typeof payload.explanation !== 'string' || !payload.explanation.trim()) errors.push('缺少解析 explanation');
  return errors;
}

export function contentErrors(kind: string, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const text = (key: string) => typeof payload[key] === 'string' && String(payload[key]).trim().length > 0;
  if (!text('source')) errors.push('缺少内容来源 source（请记录资料名称、作者或授权说明）');
  if (kind === 'word') {
    if (!text('word')) errors.push('缺少单词 word');
    if (!text('meaning')) errors.push('缺少释义 meaning');
    errors.push(...choiceErrors(payload));
  } else if (kind === 'listening' || kind === 'reading') {
    if (!text('title')) errors.push('缺少标题 title');
    if (kind === 'reading' && !text('passage')) errors.push('缺少文章 passage');
    if (kind === 'listening' && !text('asset_id') && payload.audio_url !== '/audio/small-habits.m4a') errors.push('缺少已上传音频 asset_id');
    if (!Array.isArray(payload.questions) || !payload.questions.length || payload.questions.length > 50) errors.push('questions 需为 1–50 道选择题');
    else payload.questions.forEach((q, index) => {
      if (!q || typeof q !== 'object' || Array.isArray(q)) errors.push(`第 ${index + 1} 题格式无效`);
      else errors.push(...choiceErrors(q).map(message => `第 ${index + 1} 题：${message}`));
    });
  } else if (kind === 'translation' || kind === 'writing') {
    if (!text('prompt')) errors.push('缺少题干 prompt');
    if (!Array.isArray(payload.references) || !payload.references.length || payload.references.some(ref => typeof ref !== 'string' || !ref.trim())) errors.push('缺少参考表达 references');
  } else errors.push('不支持的内容类型');
  return errors;
}

export function questionsFromContent(content: ContentRecord): ServerQuestion[] {
  if (!['word', 'listening', 'reading'].includes(content.kind) || contentErrors(content.kind, content.payload).length) return [];
  const payload = content.payload;
  const rows = content.kind === 'word' ? [payload] : payload.questions as Record<string, unknown>[];
  return rows.map((q, index) => ({
    id: content.kind === 'word' ? content.id : `${content.id}:${index}`,
    contentItemId: content.id, version: content.version,
    word: String(payload.word ?? payload.title), phonetic: String(payload.phonetic ?? ''),
    prompt: String(q.prompt), options: q.options as string[], correctIndex: Number(q.correct_index), explanation: String(q.explanation),
    source: String(payload.source), passage: content.kind === 'reading' ? String(payload.passage) : undefined,
    audioUrl: content.kind === 'listening' ? (payload.asset_id ? `/api/content/${content.id}/versions/${content.version}/audio` : '/audio/small-habits.m4a') : undefined,
  }));
}

export async function publishedQuestions(store: StudyStore, kind: string, userId?: string): Promise<ServerQuestion[]> {
  return (await store.listPublishedContent(kind, userId)).flatMap(questionsFromContent);
}

export async function sessionQuestions(store: StudyStore, selection: QuestionSelection): Promise<ServerQuestion[]> {
  const cache = new Map<string, ServerQuestion[]>();
  const result: ServerQuestion[] = [];
  for (const id of selection.questionIds) {
    // Only pre-upgrade sessions may resolve the original demonstration bank.
    if (!selection.questionVersions) {
      const legacy = questionById.get(id);
      if (!legacy) throw new Error('LEGACY_QUESTION_MISSING');
      result.push(legacy);
      continue;
    }
    const contentId = id.split(':')[0];
    const version = selection.questionVersions[id];
    const key = `${contentId}:${version}`;
    if (!cache.has(key)) {
      const content = await store.getContentVersion(contentId, version);
      cache.set(key, content ? questionsFromContent(content) : []);
    }
    const question = cache.get(key)!.find(q => q.id === id);
    if (!question) throw new Error('FROZEN_QUESTION_MISSING');
    result.push(question);
  }
  return result;
}

export function sampleQuestions(questions: ServerQuestion[], count: number): ServerQuestion[] {
  const pool = [...questions];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}
