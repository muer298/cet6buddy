import type { ServerQuestion } from './types.ts';

export const questions: ServerQuestion[] = [
  { id: 'w-sustainable', version: 1, word: 'sustainable', phonetic: '/səˈsteɪnəbl/', prompt: '选择最常见的语境义', options: ['短暂而强烈的', '可持续的；可维持的', '难以察觉的', '相互依赖的'], correctIndex: 1, explanation: '常用于 sustainable development、growth 或 lifestyle。' },
  { id: 'w-inevitable', version: 1, word: 'inevitable', phonetic: '/ɪnˈevɪtəbl/', prompt: '选择正确释义', options: ['不可避免的', '非常谨慎的', '逐渐减少的', '容易获得的'], correctIndex: 0, explanation: '表示某事无法避免、必然发生。' },
  { id: 'w-conventional', version: 2, word: 'conventional', phonetic: '/kənˈvenʃənl/', prompt: '选择正确释义', options: ['创新的', '传统的；常规的', '有争议的', '临时的'], correctIndex: 1, explanation: '常见搭配是 conventional methods 或 conventional wisdom。' },
  { id: 'w-alleviate', version: 1, word: 'alleviate', phonetic: '/əˈliːvieɪt/', prompt: '选择正确释义', options: ['加剧', '缓解', '忽略', '预测'], correctIndex: 1, explanation: '常用于 alleviate stress、pain 或 pressure。' },
  { id: 'w-substantial', version: 1, word: 'substantial', phonetic: '/səbˈstænʃl/', prompt: '选择正确释义', options: ['微不足道的', '大量的；实质性的', '不稳定的', '相似的'], correctIndex: 1, explanation: '可表示数量可观，也可表示重要或实质性的。' },
  { id: 'w-compelling', version: 1, word: 'compelling', phonetic: '/kəmˈpelɪŋ/', prompt: '选择正确释义', options: ['令人信服的；引人注目的', '可以替换的', '偶然发生的', '容易忽略的'], correctIndex: 0, explanation: '常用于 compelling evidence、argument 或 story。' },
  { id: 'w-deteriorate', version: 1, word: 'deteriorate', phonetic: '/dɪˈtɪəriəreɪt/', prompt: '选择正确释义', options: ['迅速扩张', '逐渐改善', '恶化；变坏', '保持稳定'], correctIndex: 2, explanation: '表示质量、状况或关系逐渐变差。' },
  { id: 'w-allocate', version: 1, word: 'allocate', phonetic: '/ˈæləkeɪt/', prompt: '选择正确释义', options: ['分配', '拒绝', '评价', '隐藏'], correctIndex: 0, explanation: '常用于 allocate time、resources 或 funds。' },
  { id: 'w-prevalent', version: 1, word: 'prevalent', phonetic: '/ˈprevələnt/', prompt: '选择正确释义', options: ['罕见的', '流行的；普遍存在的', '短期的', '精确的'], correctIndex: 1, explanation: '用于描述某种现象在特定群体或地区普遍存在。' },
  { id: 'w-reinforce', version: 1, word: 'reinforce', phonetic: '/ˌriːɪnˈfɔːs/', prompt: '选择正确释义', options: ['削弱', '推迟', '强化；巩固', '复制'], correctIndex: 2, explanation: '可表示强化结构，也可表示巩固观点、行为或印象。' },
  { id: 'l-small-habits', version: 1, word: 'Small Habits', phonetic: 'Listening', prompt: 'What does the woman suggest?', options: ['She should make a complete change today.', 'She should begin with small consistent actions.', 'She should wait until she has more time.', 'She should ask someone else to decide.'], correctIndex: 1, explanation: '讲话者建议从小而持续的行动开始。' },
  { id: 'r-small-habits', version: 1, word: 'Why Small Habits Matter', phonetic: 'Reading', prompt: 'Why do repeated actions become easier to maintain?', options: ['Because they require expensive equipment.', 'Because repetition makes behavior easier to maintain.', 'Because they eliminate the need for motivation.', 'Because they always produce immediate results.'], correctIndex: 1, explanation: '文章证据说明稳定情境中的重复会降低维持行为的难度。' },
];

export const questionById = new Map(questions.map(question => [question.id, question]));
