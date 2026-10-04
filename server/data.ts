import type { ServerQuestion } from './types.ts';

export const questions: ServerQuestion[] = [
  { id: 'w-sustainable', version: 1, word: 'sustainable', phonetic: '/səˈsteɪnəbl/', prompt: '选择最常见的语境义', options: ['短暂而强烈的', '可持续的；可维持的', '难以察觉的', '相互依赖的'], correctIndex: 1, explanation: '常用于 sustainable development、growth 或 lifestyle。' },
  { id: 'w-inevitable', version: 1, word: 'inevitable', phonetic: '/ɪnˈevɪtəbl/', prompt: '选择正确释义', options: ['不可避免的', '非常谨慎的', '逐渐减少的', '容易获得的'], correctIndex: 0, explanation: '表示某事无法避免、必然发生。' },
  { id: 'w-conventional', version: 2, word: 'conventional', phonetic: '/kənˈvenʃənl/', prompt: '选择正确释义', options: ['创新的', '传统的；常规的', '有争议的', '临时的'], correctIndex: 1, explanation: '常见搭配是 conventional methods 或 conventional wisdom。' },
  { id: 'w-alleviate', version: 1, word: 'alleviate', phonetic: '/əˈliːvieɪt/', prompt: '选择正确释义', options: ['加剧', '缓解', '忽略', '预测'], correctIndex: 1, explanation: '常用于 alleviate stress、pain 或 pressure。' },
  { id: 'w-substantial', version: 1, word: 'substantial', phonetic: '/səbˈstænʃl/', prompt: '选择正确释义', options: ['微不足道的', '大量的；实质性的', '不稳定的', '相似的'], correctIndex: 1, explanation: '可表示数量可观，也可表示重要或实质性的。' },
];

export const questionById = new Map(questions.map(question => [question.id, question]));
