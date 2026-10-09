import { questions } from './data.ts';

// Compatibility import only. These are product demonstration questions, NOT official CET-6 exam papers.
export const legacyContent = questions.map(q => {
  const kind = q.id.startsWith('w-') ? 'word' : q.id.startsWith('l-') ? 'listening' : 'reading';
  const choice = { prompt: q.prompt, options: q.options, correct_index: q.correctIndex, explanation: q.explanation };
  const payload: Record<string, unknown> = {
    seed_key: `legacy-bank-${q.id}`, source: 'CET6 Buddy 内置试用示例（非官方真题）',
    ...(kind === 'word' ? { word: q.word, phonetic: q.phonetic, meaning: q.options[q.correctIndex], ...choice } : { title: q.word, questions: [choice] }),
    ...(kind === 'listening' ? { audio_url: '/audio/small-habits.m4a' } : {}),
    ...(kind === 'reading' ? { passage: 'Small habits reduce the effort required to begin. When an action is repeated in a stable context, it gradually becomes easier to maintain. The immediate result may be modest, but consistency allows the effect to accumulate.\n\nResearchers therefore suggest focusing on actions that are realistic enough to repeat, rather than dramatic changes that disappear after a few days.' } : {}),
  };
  return { id: q.id, version: q.version, kind, payload };
});
