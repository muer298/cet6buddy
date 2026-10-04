import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { initialTasks, modules } from './data';
import { createStudySession, finishStudySession, submitSessionAnswer } from './api';
import type { Attempt, Question, Route, SessionResult, SyncState } from './types';

const iconByRoute: Record<string, string> = { today: '⌂', study: '▤', games: '◇', team: '♧', me: '○' };

function getRoute(): Route {
  return (window.location.hash.slice(1) || 'today') as Route;
}

function go(route: Route) {
  window.location.hash = route;
}

function StatusBar() {
  return <div className="statusbar"><span>09:41</span><div className="status-icons"><span>5G</span><span>▮▮▮</span><i className="status-dot" /></div></div>;
}

function TopBar({ title, subtitle, action = '⋯' }: { title: string; subtitle?: string; action?: string }) {
  return <><StatusBar /><header className="topbar"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h1>{title}</h1></div><button className="icon-btn" aria-label="更多操作">{action}</button></header></>;
}

function DetailTop({ title, right = '☆' }: { title: string; right?: string }) {
  return <><StatusBar /><header className="topbar"><button className="back" onClick={() => history.back()} aria-label="返回">‹</button><h2>{title}</h2><button className="icon-btn" aria-label="收藏">{right}</button></header></>;
}

function BottomNav({ active }: { active: Route }) {
  const items: Array<[Route, string]> = [['today', '今日'], ['study', '学习'], ['games', '闯关'], ['team', '小队'], ['me', '我的']];
  return <nav className="bottom-nav">{items.map(([route, label]) => <button key={route} className={`nav-item ${active === route ? 'active' : ''}`} onClick={() => go(route)}><b>{iconByRoute[route]}</b>{label}</button>)}</nav>;
}

function PhoneShell({ children, active, noNav = false }: { children: ReactNode; active?: Route; noNav?: boolean }) {
  return <main className="phone-shell"><section className={`page ${noNav ? 'no-nav' : ''}`}>{children}</section>{!noNav && active && <BottomNav active={active} />}</main>;
}

function SyncBanner({ state }: { state: SyncState }) {
  const content = {
    synced: ['☁', '学习记录已由服务器确认，本设备可以安全继续。'],
    submitting: ['↻', '正在提交答案，请不要重复点击。'],
    pending: ['◷', '当前记录待同步，确认前不会显示积分到账。'],
    failed: ['!', '保存失败，答案仍保留在本机。请重试。'],
  }[state];
  return <div className={`sync-bar sync-${state}`}><b>{content[0]}</b><span>{content[1]}</span></div>;
}

function TodayPage({ completedNewWords }: { completedNewWords: number }) {
  const tasks = initialTasks.map(task => task.id === 'new' ? { ...task, progress: Math.min(task.total, task.progress + completedNewWords) } : task);
  const earned = tasks.filter(task => task.progress >= task.total).reduce((sum, task) => sum + task.points, 0);
  return <PhoneShell active="today">
    <TopBar title="早上好，小词同学" subtitle="10月3日 · 距离考试还有 78 天" action="◉" />
    <SyncBanner state="synced" />
    <section className="hero"><div className="hero-kicker">✦ 今日标准计划 · {earned}/45 分</div><h2>今天再完成 2 项，就能点亮打卡</h2><p>先完成到期复习，再选一组听力或阅读。小游戏不会影响打卡。</p><div className="hero-row"><div className="hero-progress"><div className="progress-label"><span>今日进度</span><span>3 / 5</span></div><div className="track"><i style={{ width: '62%' }} /></div></div><button className="round-btn" onClick={() => go('word')}>›</button></div></section>
    <div className="section-head"><h3>今日任务</h3><button>调整计划</button></div>
    <div className="task-list">{tasks.map((task, index) => { const done = task.progress >= task.total; return <button className={`task ${done ? 'done' : ''}`} key={task.id} onClick={() => go(task.route)}><span className="task-icon" style={{ background: ['#e9f8f2', '#eeebff', '#eaf3ff', '#fff0e7', '#fff7df'][index] }}>{['↻', 'A', '◖', '✎', '◇'][index]}</span><span className="task-copy"><strong>{task.title}</strong><small>{task.description}</small></span><span className="task-meta">{task.progress}/{task.total}</span><span className="check">{done ? '✓' : ''}</span></button>; })}</div>
    <div className="section-head"><h3>小队在学</h3><button onClick={() => go('team')}>查看周榜</button></div>
    <button className="team-strip" onClick={() => go('team')}><span className="rings"><i className="mini-avatar" style={{ background: '#ffd8a8' }}>柚</i><i className="mini-avatar" style={{ background: '#c7ebff' }}>林</i><i className="mini-avatar" style={{ background: '#e5d6ff' }}>乔</i></span><span><strong>3 位伙伴已完成今日计划</strong><small>本周共同目标 14 / 20 人次</small></span><span className="chev">›</span></button>
  </PhoneShell>;
}

function StudyPage() {
  return <PhoneShell active="study"><TopBar title="学习中心" subtitle="五类能力 · 共享同一复习进度" action="⌕" /><div className="chips"><button className="chip active">全部</button><button className="chip">待复习 26</button><button className="chip">收藏 18</button><button className="chip">错题 9</button></div><div className="section-head"><h3>选择学习内容</h3><span className="pill">今日推荐</span></div><div className="module-grid">{modules.map((item, index) => <button className={`module-card ${index === modules.length - 1 ? 'wide' : ''}`} key={item.route} onClick={() => go(item.route)}><span className="module-icon" style={{ background: item.color }}>{item.icon}</span><span><h3>{item.title}</h3><p>{item.desc}</p></span><b className="count">{item.count}</b></button>)}</div><div className="feature-card"><div className="section-head" style={{ margin: '0 0 8px' }}><h3>本周复习节奏</h3><span className="pill mint">稳定</span></div><p>你在 3 天间隔的词汇上表现最好。今天的错词会回到短间隔队列，不影响已经掌握的记录。</p></div></PhoneShell>;
}

interface WordSessionProps {
  onFinish: (result: SessionResult) => void;
}

function WordSession({ onFinish }: WordSessionProps) {
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sync, setSync] = useState<SyncState>('pending');
  const [feedback, setFeedback] = useState<{ attempt: Attempt; correctAnswer: number; explanation: string } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [loadError, setLoadError] = useState('');
  const question = questions[index];

  useEffect(() => {
    let active = true;
    createStudySession()
      .then(response => {
        if (!active) return;
        setSessionId(response.session.id);
        setQuestions(response.session.questions);
        setSync('synced');
      })
      .catch(cause => {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : '无法连接学习服务。');
        setSync('failed');
      });
    return () => { active = false; };
  }, []);

  async function handleSubmit() {
    if (selected === null || sync === 'submitting' || !sessionId) return;
    setSync('submitting');
    const key = `${Date.now()}-${question.id}`;
    try {
      const response = await submitSessionAnswer(sessionId, question, selected, key);
      if (!response.feedback) throw new Error('当前练习尚未开放答案反馈。');
      const attempt: Attempt = {
        questionId: question.id,
        questionVersion: question.version,
        answerIndex: selected,
        correct: response.feedback.correct,
        idempotencyKey: key,
        submittedAt: new Date().toISOString(),
      };
      setFeedback({ attempt, correctAnswer: response.feedback.correct_answer, explanation: response.feedback.explanation });
      setAttempts(current => [...current, attempt]);
      setSync('synced');
    } catch {
      setSync('failed');
    }
  }

  async function next() {
    if (index < questions.length - 1) {
      setIndex(value => value + 1);
      setSelected(null);
      setFeedback(null);
      setHintVisible(false);
      return;
    }
    setSync('submitting');
    try {
      const finished = await finishStudySession(sessionId);
      const needsReview = attempts.filter(attempt => !attempt.correct).map(attempt => questions.find(item => item.id === attempt.questionId)?.word ?? attempt.questionId);
      onFinish({ attempts, correct: finished.result.correct, total: finished.result.total, score: finished.result.score, needsReview, reward: finished.reward });
    } catch {
      setSync('failed');
    }
  }

  if (!question) {
    return <PhoneShell active="study"><DetailTop title="单词复习" /><SyncBanner state={sync} /><div className="feature-card"><h3>{loadError ? '学习服务暂时不可用' : '正在创建学习会话'}</h3><p>{loadError || '正在冻结题目版本并读取到期复习内容…'}</p></div>{loadError && <button className="primary" onClick={() => window.location.reload()}>重新连接</button>}</PhoneShell>;
  }

  return <PhoneShell active="study"><DetailTop title="单词复习" />
    {sync !== 'synced' && <SyncBanner state={sync} />}
    <div className="question-progress">{questions.map((item, itemIndex) => <i key={item.id} className={itemIndex < index ? 'done' : itemIndex === index ? 'now' : ''} />)}</div>
    <div className="study-card"><span className="pill mint">到期复习 · 识义</span><div className="word">{question.word}</div><div className="phonetic">{question.phonetic}</div><button className="sound" aria-label="播放发音">◖</button><div className="hint-box"><b>{question.prompt}</b><br />{hintVisible ? (question.hint ?? '回忆常见搭配和具体语境。') : '先在脑中回忆，再选择答案。词根只作为辅助线索。'}</div></div>
    <div className="options">{question.options.map((option, optionIndex) => { const answerClass = feedback ? optionIndex === feedback.correctAnswer ? 'correct' : optionIndex === feedback.attempt.answerIndex ? 'wrong' : '' : selected === optionIndex ? 'selected' : ''; return <button disabled={Boolean(feedback)} className={`option ${answerClass}`} key={option} onClick={() => setSelected(optionIndex)}><span>{'ABCD'[optionIndex]}</span>{option}</button>; })}</div>
    {!feedback ? <><button className="primary" disabled={selected === null || sync === 'submitting'} onClick={handleSubmit}>{sync === 'submitting' ? '提交中…' : '确认答案'}</button><button className="text-link" style={{ display: 'block', margin: '15px auto' }} onClick={() => setHintVisible(true)}>看提示后作答</button></> : <><div className={`answer-feedback ${feedback.attempt.correct ? 'is-correct' : 'is-wrong'}`}><b>{feedback.attempt.correct ? '回答正确' : '需要订正'}</b><span>{feedback.attempt.correct ? '首次答案已由服务器确认。' : `正确答案：${question.options[feedback.correctAnswer]}`}</span></div><div className="hint-box" style={{ marginTop: 10 }}>{feedback.explanation}</div><button className="primary" onClick={next} disabled={sync === 'submitting'}>{sync === 'submitting' ? '正在结算…' : index === questions.length - 1 ? '查看本次结果' : '下一词'}</button></>}
  </PhoneShell>;
}

function ResultPage({ result, onRestart }: { result: SessionResult | null; onRestart: () => void }) {
  if (!result) return <PhoneShell noNav><StatusBar /><div className="feature-card"><h3>暂时没有练习结果</h3><p>完成一组单词复习后，这里会显示首次正确率和订正建议。</p></div><button className="primary" onClick={() => go('word')}>开始复习</button></PhoneShell>;
  return <PhoneShell noNav><StatusBar /><div style={{ textAlign: 'center', paddingTop: 40 }}><div style={{ fontSize: 70 }}>{result.correct === result.total ? '🎉' : '🌱'}</div><p className="eyebrow">本组已由服务器确认</p><h1 style={{ fontSize: 30, margin: 8 }}>{result.correct} / {result.total} 题正确</h1><p style={{ color: 'var(--muted)' }}>单词识义 · {result.score} 局内分</p></div><div className="metric-row" style={{ marginTop: 28 }}><div className="metric"><strong>{result.score}</strong><small>本组得分</small></div><div className="metric"><strong>{Math.round(result.correct / result.total * 100)}%</strong><small>首次正确率</small></div><div className="metric"><strong>{result.needsReview.length}</strong><small>需要复习</small></div></div>{result.reward && <SyncBanner state="synced" />}<div className="feature-card"><h3>下一步建议</h3><p>{result.needsReview.length ? `先订正 ${result.needsReview.join('、')}，它们会回到短间隔复习队列。` : '本组全部正确。明天仍会按复习间隔安排回忆，避免只凭熟悉感判断掌握。'}</p>{result.reward && <p><b>{result.reward.awarded ? `今日小游戏学习积分 +${result.reward.points}` : '今日小游戏奖励已领取，不重复发放'}</b></p>}</div><button className="primary" onClick={onRestart}>再练一组</button><button className="secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => go('today')}>返回今日</button></PhoneShell>;
}

function LearningDetail({ route }: { route: Route }) {
  const content: Record<string, { title: string; tag: string; headline: string; body: string; action: string }> = {
    listening: { title: '听力练习', tag: '练习模式 · 保留播放位置', headline: 'What does the woman suggest?', body: '支持暂停、倍速、重复与段落循环。答案提交后再展示解析和相关原文。', action: '播放当前段落' },
    reading: { title: '仔细阅读', tag: '文章位置已保留 · 62%', headline: 'Why Small Habits Matter', body: '文章与题目可切换查看。作答后可标记支持答案的证据句，并收藏词句。', action: '查看第 2 题' },
    translation: { title: '翻译积累', tag: '文化 · 到期复习', headline: '在……方面发挥重要作用', body: '先独立回忆，再查看多个可接受参考译法。开放输出只保存作品，不生成虚假分数。', action: '显示参考译法' },
    writing: { title: '作文句式', tag: '提出做法', headline: 'One practical way to … is to …', body: '理解用法、遮挡回忆、词块排序，再换话题独立改写并使用清单自检。', action: '开始词块排序' },
  };
  const item = content[route];
  return <PhoneShell active="study"><DetailTop title={item.title} /><div className="feature-card"><span className="pill">{item.tag}</span><h3 style={{ fontSize: 22, lineHeight: 1.45, marginTop: 18 }}>{item.headline}</h3><p>{item.body}</p></div>{route === 'listening' && <div className="audio-player" style={{ marginTop: 14 }}><div className="wave">{[18, 28, 42, 22, 49, 34, 26, 45, 19, 38, 51, 29].map((height, index) => <i key={index} style={{ height }} />)}</div><div className="player-row"><span>01:18 / 02:40</span><button className="player-control">▶</button><span>1.0× · 循环</span></div></div>}<button className="primary">{item.action}</button></PhoneShell>;
}

function GamesPage() {
  const games = [
    ['rootgame', 'purple', '01', '词根串串', '先理解构词线索，再完成辨义、语境与回忆。', '不限时 · 满分 50'],
    ['flashgame', 'blue', '02', '单词闪答', '大单词、音标与四选一；音频未就绪不会消耗时间。', '10 题 · 12 秒/题'],
    ['streakgame', 'orange', '03', '例句连胜', '从真实语境判断词义，连续答对获得额外局内分。', '10 题 · 最高 115'],
  ] as const;
  return <PhoneShell active="games"><TopBar title="闯关" subtitle="小游戏得分与学习积分分开记录" action="⚙" /><div className="chips"><button className="chip active">单人练习</button><button className="chip" onClick={() => go('challenge')}>好友挑战</button></div><div className="section-head"><h3>选择玩法</h3><span className="pill orange">今日 +5</span></div>{games.map(game => <button className={`game-card ${game[1]}`} key={game[0]} onClick={() => go(game[0])}><span className="game-num">{game[2]}</span><h3>{game[3]}</h3><p>{game[4]}</p><span className="game-footer"><small>{game[5]}</small><i className="play">▶</i></span></button>)}</PhoneShell>;
}

function GameDetail({ route }: { route: Route }) {
  const data = route === 'rootgame' ? ['词根串串', 'careless', 'care + less → 缺少关心或注意', ['无忧无虑的', '粗心的', '漠不关心的', '无能力的']] : route === 'flashgame' ? ['单词闪答', 'inevitable', '/ɪnˈevɪtəbl/', ['不可避免的', '非常谨慎的', '逐渐减少的', '容易获得的']] : ['例句连胜', 'alleviate', 'Regular exercise can alleviate stress.', ['加剧', '缓解', '忽略', '预测']];
  return <PhoneShell active="games"><DetailTop title={data[0] as string} right="12" /><div className="question-progress">{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < 3 ? 'done' : index === 3 ? 'now' : ''} />)}</div><div className="study-card"><span className="pill orange">第 4 / 10 题</span><div className="word">{data[1] as string}</div><div className="phonetic">{data[2] as string}</div></div><div className="options">{(data[3] as string[]).map((option, index) => <button className="option" key={option}><span>{'ABCD'[index]}</span>{option}</button>)}</div><p className="eyebrow" style={{ textAlign: 'center', marginTop: 14 }}>首次有效答案将立即锁定</p></PhoneShell>;
}

function TeamPage() {
  const people = [['柚子', '标准计划', 165, '#ffd8a8'], ['小词同学', '标准计划', 145, '#e5d6ff'], ['阿林', '轻量计划', 120, '#c7ebff'], ['乔乔', '标准计划', 95, '#d6f4de']];
  return <PhoneShell active="team"><TopBar title="六级上岸小队" subtitle="本周一 00:00 起 · 5 位成员" action="＋" /><section className="hero" style={{ background: 'linear-gradient(145deg,#2c2940,#4b4568)' }}><div className="hero-kicker">共同目标 · 本周 20 人次打卡</div><h2>再完成 6 次，一起点亮本周徽章</h2><p>学习积分反映计划完成，不代表知识量或六级分数。</p><div className="hero-row"><div className="hero-progress"><div className="progress-label"><span>14 / 20</span><span>70%</span></div><div className="track"><i style={{ width: '70%', background: '#75e3bb' }} /></div></div></div></section><div className="section-head"><h3>本周小队榜</h3><span className="pill">同分并列</span></div><div className="leader-list">{people.map((person, index) => <div className="leader" key={person[0]}><span className="rank">{index + 1}</span><i className="mini-avatar" style={{ margin: 0, border: 0, background: person[3] }}>{String(person[0])[0]}</i><span><strong>{person[0]}</strong><small>{person[1]} · 今日学习中</small></span><span className="score">{person[2]}</span></div>)}</div><button className="primary" onClick={() => go('challenge')}>查看异步挑战</button></PhoneShell>;
}

function MePage() {
  return <PhoneShell active="me"><TopBar title="我的" subtitle="个人记录默认私有" action="⚙" /><div className="profile-card"><div className="avatar">词</div><div><h2>小词同学</h2><p>标准计划 · 已坚持 12 天 · 145 学习积分</p></div></div><div className="section-head"><h3>学习资产</h3><button>导出记录</button></div><div className="metric-row"><div className="metric"><strong>286</strong><small>已学词汇</small></div><div className="metric"><strong>18</strong><small>收藏表达</small></div><div className="metric"><strong>9</strong><small>待订正</small></div></div><div className="section-head"><h3>设置与资料</h3></div><div className="menu-list"><button className="menu-item" onClick={() => go('upload')}><b>⇧</b><span>我的资料与上传</span><small>›</small></button><button className="menu-item" onClick={() => go('onboarding')}><b>◎</b><span>每日计划与考试目标</span><small>标准 ›</small></button><button className="menu-item" onClick={() => go('admin')}><b>▦</b><span>内容管理后台示意</span><small>桌面端 ›</small></button></div></PhoneShell>;
}

function UtilityPage({ route }: { route: Route }) {
  const title = route === 'upload' ? '我的资料' : route === 'challenge' ? '好友挑战' : route === 'onboarding' ? '每日计划设置' : '邮箱验证码登录';
  return <PhoneShell active={route === 'upload' ? 'me' : route === 'challenge' ? 'games' : undefined} noNav={route === 'login' || route === 'onboarding'}><DetailTop title={title} /><div className="feature-card"><span className="pill">功能原型</span><h3 style={{ marginTop: 18 }}>{route === 'upload' ? '上传图片、PDF 或音频' : route === 'challenge' ? '周末词汇闪答赛' : route === 'onboarding' ? '选择标准、轻量或自定义计划' : '登录后跨设备保存学习进度'}</h3><p>{route === 'upload' ? '原始附件默认私有，进入草稿、字段检查、人工预览和发布流程。' : route === 'challenge' ? '截止前只显示完成状态；题目版本、规则和资格在开始时冻结。' : '这一页面将在账号与后端模块中接入真实验证和持久化。'}</p></div><button className="primary" onClick={() => go(route === 'challenge' ? 'flashgame' : 'today')}>{route === 'challenge' ? '开始唯一一次计榜' : '保存并继续'}</button></PhoneShell>;
}

function AdminPage() {
  const rows = [['2023年12月听力一', '听力题组', '已发布', 'v3'], ['核心词汇 Week 04', '词书', '待预览', 'v1'], ['中国传统节日', '翻译主题', '草稿', '—']];
  return <div className="admin-shell"><aside className="admin-side"><div className="logo"><i className="logo-mark">B</i>CET6 Buddy</div>{['概览', '内容库', '题组管理', '资料导入', '音频资源', '发布记录', '权限与审计'].map((item, index) => <span className={`admin-link ${index === 1 ? 'active' : ''}`} key={item}>{item}</span>)}<button className="admin-link" onClick={() => go('me')}>← 返回手机端</button></aside><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">内容管理后台 · 桌面优先</p><h1>内容库</h1></div><button className="secondary">＋ 新建内容</button></div><div className="admin-stats">{[['已发布', '1,284'], ['待检查', '18'], ['今日新增', '36'], ['引用中', '42']].map(item => <div className="admin-stat" key={item[0]}><span className="pill">{item[0]}</span><strong>{item[1]}</strong><small>内容项目</small></div>)}</div><div className="data-table"><div className="data-row header"><span>内容名称</span><span>类型</span><span>状态</span><span>版本</span><span>操作</span></div>{rows.map(row => <div className="data-row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span><i className="pill">{row[2]}</i></span><span>{row[3]}</span><button className="text-link">编辑</button></div>)}</div></main></div>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [result, setResult] = useState<SessionResult | null>(() => {
    const saved = localStorage.getItem('cet6:lastResult');
    return saved ? JSON.parse(saved) as SessionResult : null;
  });
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    const handleHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const completedNewWords = useMemo(() => result?.total ?? 0, [result]);

  function finishSession(nextResult: SessionResult) {
    setResult(nextResult);
    localStorage.setItem('cet6:lastResult', JSON.stringify(nextResult));
    go('result');
  }

  if (route === 'admin') return <AdminPage />;
  if (route === 'today') return <TodayPage completedNewWords={completedNewWords} />;
  if (route === 'study') return <StudyPage />;
  if (route === 'word') return <WordSession key={sessionKey} onFinish={finishSession} />;
  if (route === 'result') return <ResultPage result={result} onRestart={() => { setSessionKey(value => value + 1); go('word'); }} />;
  if (['listening', 'reading', 'translation', 'writing'].includes(route)) return <LearningDetail route={route} />;
  if (route === 'games') return <GamesPage />;
  if (['rootgame', 'flashgame', 'streakgame'].includes(route)) return <GameDetail route={route} />;
  if (route === 'team') return <TeamPage />;
  if (route === 'me') return <MePage />;
  return <UtilityPage route={route} />;
}
