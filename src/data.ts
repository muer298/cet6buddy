import type { Question, StudyTask } from './types';

export const initialTasks: StudyTask[] = [
  { id: 'review', title: '到期复习', description: '20 个词 · 已完成订正', progress: 20, total: 20, points: 10, route: 'word', required: true },
  { id: 'new', title: '学习新词', description: '10 个词 · 剩余 4 个', progress: 6, total: 10, points: 10, route: 'word', required: true },
  { id: 'input', title: '听力或阅读', description: '任选一项完成', progress: 0, total: 1, points: 10, route: 'listening', required: true },
  { id: 'output', title: '句式或翻译', description: '积累 2 条表达', progress: 2, total: 2, points: 10, route: 'writing', required: true },
  { id: 'game', title: '小游戏', description: '完成整局并订正', progress: 1, total: 1, points: 5, route: 'games', required: false },
];

export const wordQuestions: Question[] = [
  { id: 'w-sustainable', version: 1, word: 'sustainable', phonetic: '/səˈsteɪnəbl/', prompt: '选择最常见的语境义', options: ['短暂而强烈的', '可持续的；可维持的', '难以察觉的', '相互依赖的'], correctIndex: 1, hint: '先回忆它与 development、growth 搭配时的含义。' },
  { id: 'w-inevitable', version: 1, word: 'inevitable', phonetic: '/ɪnˈevɪtəbl/', prompt: '选择正确释义', options: ['不可避免的', '非常谨慎的', '逐渐减少的', '容易获得的'], correctIndex: 0, hint: 'in- 表示否定，evitable 与 avoidable 接近。' },
  { id: 'w-conventional', version: 2, word: 'conventional', phonetic: '/kənˈvenʃənl/', prompt: '选择正确释义', options: ['创新的', '传统的；常规的', '有争议的', '临时的'], correctIndex: 1, hint: '常见搭配：conventional methods。' },
  { id: 'w-alleviate', version: 1, word: 'alleviate', phonetic: '/əˈliːvieɪt/', prompt: '选择正确释义', options: ['加剧', '缓解', '忽略', '预测'], correctIndex: 1, hint: '常见搭配：alleviate stress / pain。' },
  { id: 'w-substantial', version: 1, word: 'substantial', phonetic: '/səbˈstænʃl/', prompt: '选择正确释义', options: ['微不足道的', '大量的；实质性的', '不稳定的', '相似的'], correctIndex: 1, hint: '常见搭配：substantial evidence / improvement。' },
];

export const modules = [
  { route: 'word', icon: 'Aa', color: '#eeebff', title: '单词', desc: '识义与拼写分开练', count: '26 待复习' },
  { route: 'listening', icon: '◖', color: '#eaf3ff', title: '听力', desc: '精听、复听与听写', count: '2 题组' },
  { route: 'reading', icon: '¶', color: '#e8f8f2', title: '阅读', desc: '文章位置自动保留', count: '1 篇' },
  { route: 'translation', icon: '译', color: '#fff0e7', title: '翻译', desc: '主题词汇与表达迁移', count: '8 条' },
  { route: 'writing', icon: '✎', color: '#fff7df', title: '作文句式', desc: '理解、回忆、改写与自检', count: '5 到期' },
] as const;
