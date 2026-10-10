import type { StudyStore } from './store.ts';
import { contentErrors, publicQuestion, sessionQuestions } from './question-bank.ts';
import type { ContentRecord } from './types.ts';

export const learningKinds = ['word', 'listening', 'reading', 'translation', 'writing'] as const;
export async function availableContent(store: StudyStore, userId: string) {
  return (await Promise.all(learningKinds.map(kind => store.listPublishedContent(kind, userId)))).flat()
    .filter(item => !contentErrors(item.kind, item.payload).length);
}

export async function learningRecords(store: StudyStore, userId: string, filter: string) {
  const published = await availableContent(store, userId);
  const lookup = new Map(published.map(c => [c.id, c]));
  const label = (content: ContentRecord | undefined) => String(content?.payload.word ?? content?.payload.title ?? content?.payload.prompt ?? '内容暂不可用');
  if (filter === 'reviews') {
    const reviews = await store.listReviews(userId, new Date().toISOString());
    // A published-version join must not multiply one skill's review entry.
    return [...new Map(reviews.map(r => [`${r.contentItemId}:${r.skill}`, r])).values()].map(r => {
      const c = lookup.get(r.contentItemId);
      return { id: `${r.contentItemId}:${r.skill}`, contentId: r.contentItemId, kind: c?.kind ?? 'word', title: label(c), version: c?.version, available: Boolean(c), skill: r.skill, date: r.dueAt };
    });
  }
  if (filter === 'collections') {
    const entries = await store.listCollections(userId);
    return Promise.all(entries.map(async r => {
      const current = lookup.get(r.contentItemId);
      const c = current ? await store.getContentVersion(r.contentItemId, r.contentVersion) : undefined;
      return { id: r.id, contentId: r.contentItemId, kind: c?.kind ?? r.kind, title: label(c), version: r.contentVersion, available: Boolean(current), date: r.createdAt, note: r.note };
    }));
  }
  const mistakes = (await store.learningActivity(userId)).filter(a => !a.correct && !a.corrected);
  return Promise.all(mistakes.map(async a => {
    const session = await store.getSession(a.sessionId);
    const question = session ? (await sessionQuestions(store, session)).find(q => q.id === a.questionId) : undefined;
    return { id: a.id, contentId: question?.contentItemId ?? a.questionId.split(':')[0], kind: ['reading', 'listening'].includes(a.source) ? a.source : 'word', title: question?.word ?? '历史题目不可用', version: a.questionVersion, available: Boolean(question), date: a.submittedAt, question: question ? publicQuestion(question) : undefined };
  }));
}
