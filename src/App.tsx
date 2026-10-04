import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { initialTasks, modules } from './data';
import { addCollection, completeInputTask, createChallenge, createCheckin, createGameSession, createManagedContent, createStudySession, createTeam, finishChallenge, finishGame, finishStudySession, getChallenges, getCurrentUser, getImports, getManagedContent, getMyTeam, getTodayPlan, joinTeam, logout, resumeStudySession, saveOpenSubmission, setManagedContentStatus, startChallenge, submitChallengeAnswer, submitGameAnswer, submitSessionAnswer, updateImportStatus, updatePlan, uploadPrivateFile, type ChallengeSummary, type GameSessionResponse, type GameType, type ImportItem, type ManagedContent, type TeamOverview, type TodayPlanResponse } from './api';
import type { Attempt, CurrentUser, Question, Route, SessionResult, SyncState } from './types';
import { LoginPage } from './pages/LoginPage';
import { getRoute, go } from './navigation';

const iconByRoute: Record<string, string> = { today: '⌂', study: '▤', games: '◇', team: '♧', me: '○' };

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
  const [serverPlan, setServerPlan] = useState<TodayPlanResponse | null>(null);
  const [planError, setPlanError] = useState('');
  const [checkinMessage, setCheckinMessage] = useState('');
  useEffect(() => {
    getTodayPlan().then(setServerPlan).catch(cause => setPlanError(cause instanceof Error ? cause.message : '今日计划加载失败。'));
  }, [completedNewWords]);
  const routeByTask: Record<string, Route> = { review: 'word', new_words: 'word', input: 'listening', output: 'writing', game: 'games' };
  const fallback = initialTasks.map(task => task.id === 'new' ? { ...task, progress: Math.min(task.total, task.progress + completedNewWords) } : task);
  const tasks = serverPlan ? serverPlan.tasks.map(task => ({ id: task.key, title: task.title, description: task.required ? '今日必做任务' : '可选巩固任务', progress: task.completed, total: task.target, points: task.points, route: routeByTask[task.key] ?? 'study', required: task.required })) : fallback;
  const earned = tasks.filter(task => task.progress >= task.total).reduce((sum, task) => sum + task.points, 0);
  const completedTasks = tasks.filter(task => task.progress >= task.total).length;
  const remainingRequired = tasks.filter(task => task.required && task.progress < task.total).length;
  return <PhoneShell active="today">
    <TopBar title="早上好，小词同学" subtitle={`${serverPlan?.server_date ?? '正在读取日期'} · ${serverPlan?.plan_tier === 'light' ? '轻量计划' : serverPlan?.plan_tier === 'custom' ? '自定义计划' : '标准计划'}`} action="◉" />
    <SyncBanner state={planError ? 'failed' : serverPlan ? 'synced' : 'pending'} />
    <section className="hero"><div className="hero-kicker">✦ 今日计划 · {earned}/45 分</div><h2>{remainingRequired ? `今天再完成 ${remainingRequired} 项，就能点亮打卡` : checkinMessage || '今日必做任务已经完成'}</h2><p>先完成到期复习，再选一组听力或阅读。小游戏不会影响打卡。</p><div className="hero-row"><div className="hero-progress"><div className="progress-label"><span>今日进度</span><span>{completedTasks} / {tasks.length}</span></div><div className="track"><i style={{ width: `${Math.round(completedTasks / tasks.length * 100)}%` }} /></div></div><button className="round-btn" aria-label={remainingRequired ? '继续学习' : '完成打卡'} onClick={() => remainingRequired ? go('word') : void createCheckin().then(result => setCheckinMessage(`${result.checkin.checkinDate} 已打卡`)).catch(cause => setCheckinMessage(cause instanceof Error ? cause.message : '打卡失败'))}>{remainingRequired ? '›' : '✓'}</button></div></section>
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
    const savedSession = localStorage.getItem('cet6:activeStudySession');
    const restore = savedSession ? resumeStudySession(savedSession).catch(() => createStudySession()) : createStudySession();
    restore
      .then(response => {
        if (!active) return;
        setSessionId(response.session.id);
        setQuestions(response.session.questions);
        setIndex('attempts' in response && Array.isArray(response.attempts) ? response.attempts.length : 0);
        localStorage.setItem('cet6:activeStudySession', response.session.id);
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
      localStorage.removeItem('cet6:activeStudySession');
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
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const [responseText, setResponseText] = useState('');
  const [selfCheck, setSelfCheck] = useState({ complete: false, natural: false, appropriate: false });
  const [saved, setSaved] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const draftKey = `cet6:draft:${route}`;

  useEffect(() => {
    if (route !== 'listening') return;
    const audio = new Audio('/audio/small-habits.m4a');
    audio.preload = 'metadata';
    audio.playbackRate = rate;
    audio.onloadedmetadata = () => { const savedPosition = Number(localStorage.getItem('cet6:listening:small-habits:position') ?? 0); if (savedPosition > 0 && savedPosition < audio.duration) audio.currentTime = savedPosition; };
    audio.ontimeupdate = () => localStorage.setItem('cet6:listening:small-habits:position', String(audio.currentTime));
    audio.onended = () => { setSpeaking(false); localStorage.removeItem('cet6:listening:small-habits:position'); };
    audio.onerror = () => { setSpeaking(false); setSaved('音频加载失败，计时未开始；可以重试或稍后继续。'); };
    audioRef.current = audio;
    return () => { audio.pause(); audioRef.current = null; };
  }, [route]);
  useEffect(() => {
    if (route !== 'translation' && route !== 'writing') return;
    const draft = localStorage.getItem(draftKey);
    if (draft) setResponseText(draft);
  }, [draftKey, route]);
  useEffect(() => {
    if (route !== 'translation' && route !== 'writing') return;
    if (responseText) localStorage.setItem(draftKey, responseText);
  }, [draftKey, responseText, route]);

  function toggleListening() {
    const audio = audioRef.current;
    if (!audio) return setSaved('音频仍在准备，请稍后重试。');
    if (!audio.paused) { audio.pause(); setSpeaking(false); return; }
    audio.playbackRate = rate;
    audio.play().then(() => setSpeaking(true)).catch(() => setSaved('音频播放失败，计时未开始；请检查网络或浏览器权限。'));
  }

  async function saveOutput() {
    if (!responseText.trim()) return;
    setSaved('正在保存…');
    try {
      const result = await saveOpenSubmission(route as 'translation' | 'writing', route === 'translation' ? 'culture-role-1' : 'practical-way-1', responseText, selfCheck);
      localStorage.removeItem(draftKey);
      setSaved(result.reward?.awarded ? `作品已保存，今日输出任务积分 +${result.reward.points}` : '作品已保存，开放表达未进行机械评分。');
    } catch (cause) {
      localStorage.setItem(draftKey, responseText);
      setSaved(`${cause instanceof Error ? cause.message : '保存失败。'} 输入已保存在本机，联网后可重试。`);
    }
  }

  const options = route === 'listening' ? ['She should make a complete change today.', 'She should begin with small consistent actions.', 'She should wait until she has more time.', 'She should ask someone else to decide.'] : ['Because they require expensive equipment.', 'Because repetition makes behavior easier to maintain.', 'Because they eliminate the need for motivation.', 'Because they always produce immediate results.'];
  const correctIndex = 1;

  return <PhoneShell active="study"><DetailTop title={item.title} /><div className="feature-card"><span className="pill">{item.tag}</span><h3 style={{ fontSize: 22, lineHeight: 1.45, marginTop: 18 }}>{item.headline}</h3><p>{item.body}</p></div>
    {route === 'listening' && <><div className="audio-player" style={{ marginTop: 14 }}><div className="wave">{[18, 28, 42, 22, 49, 34, 26, 45, 19, 38, 51, 29].map((height, index) => <i key={index} style={{ height }} />)}</div><div className="player-row"><button className="text-link" onClick={() => setRate(value => { const next = value === 1 ? 1.25 : value === 1.25 ? 1.5 : 1; if (audioRef.current) audioRef.current.playbackRate = next; return next; })}>{rate.toFixed(2)}×</button><button className="player-control" onClick={toggleListening}>{speaking ? 'Ⅱ' : '▶'}</button><button className="text-link" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play().then(() => setSpeaking(true)); } }}>重播</button></div></div><div className="options">{options.map((option, index) => <button disabled={submitted} className={`option ${submitted ? index === correctIndex ? 'correct' : index === selected ? 'wrong' : '' : selected === index ? 'selected' : ''}`} key={option} onClick={() => setSelected(index)}><span>{'ABCD'[index]}</span>{option}</button>)}</div><button className="primary" disabled={selected === null || submitted} onClick={() => { setSubmitted(true); void completeInputTask().catch(() => setSaved('任务进度同步失败，答案仍保留在本页。')); }}>提交听力答案</button>{submitted && <div className="answer-feedback is-correct"><b>{selected === correctIndex ? '首次作答正确' : '已保存首次答案'}</b><span>建议从小而持续的行动开始。</span></div>}</>}
    {route === 'reading' && <><div className="segmented"><button className={showPassage ? 'active' : ''} onClick={() => setShowPassage(true)}>文章</button><button className={!showPassage ? 'active' : ''} onClick={() => setShowPassage(false)}>题目</button></div>{showPassage ? <div className="passage"><h3>Why Small Habits Matter</h3><p>Small habits reduce the effort required to begin. When an action is repeated in a stable context, it gradually becomes easier to maintain. The immediate result may be modest, but consistency allows the effect to accumulate.</p><p>Researchers therefore suggest focusing on actions that are realistic enough to repeat, rather than dramatic changes that disappear after a few days.</p></div> : <><div className="options">{options.map((option, index) => <button disabled={submitted} className={`option ${submitted ? index === correctIndex ? 'correct' : index === selected ? 'wrong' : '' : selected === index ? 'selected' : ''}`} key={option} onClick={() => setSelected(index)}><span>{'ABCD'[index]}</span>{option}</button>)}</div><button className="primary" disabled={selected === null || submitted} onClick={() => { setSubmitted(true); void completeInputTask().catch(() => setSaved('任务进度同步失败，答案仍保留在本页。')); }}>提交阅读答案</button>{submitted && <div className="hint-box" style={{ marginTop: 12 }}><b>证据句：</b> When an action is repeated in a stable context, it gradually becomes easier to maintain.</div>}</>}</>}
    {(route === 'translation' || route === 'writing') && <><label className="field-label">你的表达</label><textarea className="form-input output-area" value={responseText} onChange={event => setResponseText(event.target.value)} placeholder={route === 'translation' ? '先独立翻译，再对照参考表达。' : '用这一句式写一个与你有关的句子。'} /><div className="check-list">{([['complete', '意义完整'], ['natural', '搭配自然'], ['appropriate', '语境合适']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={selfCheck[key]} onChange={event => setSelfCheck(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><button className="primary" disabled={!responseText.trim()} onClick={saveOutput}>保存作品与自检</button><button className="secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => setSubmitted(true)}>对照参考表达</button>{submitted && <div className="hint-box" style={{ marginTop: 12 }}>{route === 'translation' ? '参考：Cultural heritage plays an important role in strengthening a shared sense of identity.' : '参考：One practical way to improve reading ability is to read a short article every day.'}</div>}</>}
    {saved && <div className="sync-bar" style={{ marginTop: 12 }}><b>✓</b><span>{saved}</span></div>}
    <button className="text-link" style={{ display: 'block', margin: '16px auto' }} onClick={() => addCollection(route === 'translation' ? 'culture-role-1' : route === 'writing' ? 'practical-way-1' : `${route}-sample-1`, 1, route).then(() => setSaved('已加入个人收藏。')).catch(() => setSaved('收藏失败，请稍后重试。'))}>☆ 收藏本条内容</button>
  </PhoneShell>;
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
  const gameType: GameType = route === 'rootgame' ? 'root-chain' : route === 'flashgame' ? 'flash' : 'streak';
  const title = route === 'rootgame' ? '词根串串' : route === 'flashgame' ? '单词闪答' : '例句连胜';
  const [session, setSession] = useState<GameSessionResponse['session'] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; correct_answer: number; explanation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<{ correct: number; score: number; longest_streak: number; reward?: { points: number; awarded: boolean } | null } | null>(null);
  const [seconds, setSeconds] = useState(12);
  const question = session?.questions[index];

  useEffect(() => {
    createGameSession(gameType, gameType === 'flash' ? 12 : undefined).then(response => { setSession(response.session); setSeconds(response.session.rules.secondsPerQuestion ?? 0); }).catch(cause => setErrorMessage(cause instanceof Error ? cause.message : '无法开始游戏。'));
  }, [gameType]);

  useEffect(() => {
    if (!session?.rules.secondsPerQuestion || feedback || result || !question) return;
    setSeconds(session.rules.secondsPerQuestion);
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [index, session?.id, feedback, result, question]);

  useEffect(() => {
    if (seconds === 0 && session?.rules.secondsPerQuestion && question && !feedback && !busy) void submit(null);
  }, [seconds]);

  async function submit(answer: number | null = selected) {
    if (!session || !question || busy) return;
    setBusy(true);
    try {
      const response = await submitGameAnswer(session.id, question, answer, `${session.id}-${question.id}`);
      setFeedback(response.feedback ?? { correct: false, correct_answer: -1, explanation: response.timed_out ? '本题超时，计为未答。' : '答案已锁定。' });
      setSession(current => current ? { ...current, score: response.score, currentStreak: response.streak } : current);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : '答案提交失败。');
    } finally {
      setBusy(false);
    }
  }

  async function nextQuestion() {
    if (!session) return;
    if (index < session.questions.length - 1) {
      setIndex(value => value + 1); setSelected(null); setFeedback(null); return;
    }
    setBusy(true);
    try {
      const finished = await finishGame(session.id);
      setResult({ ...finished.result, reward: finished.reward });
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : '结算失败。');
    } finally { setBusy(false); }
  }

  if (result) return <PhoneShell active="games"><DetailTop title={title} /><div className="result-hero"><div className="result-emoji">🏁</div><h1>{result.score} 分</h1><p>{result.correct} 题正确 · 最长连胜 {result.longest_streak}</p></div><div className="feature-card"><h3>本局由服务器结算</h3><p>{result.reward?.awarded ? `今日合格小游戏积分 +${result.reward.points}` : '今日小游戏积分已领取或本局未达到奖励条件。'}</p></div><button className="primary" onClick={() => go('games')}>返回闯关</button></PhoneShell>;
  if (!session || !question) return <PhoneShell active="games"><DetailTop title={title} /><div className="feature-card"><h3>{errorMessage || '正在冻结本局题目与规则'}</h3><p>题目版本和首次答案将由服务器确认。</p></div></PhoneShell>;

  return <PhoneShell active="games"><DetailTop title={title} right={session.rules.secondsPerQuestion ? String(seconds) : '∞'} /><div className="question-progress">{session.questions.map((item, itemIndex) => <i key={item.id} className={itemIndex < index ? 'done' : itemIndex === index ? 'now' : ''} />)}</div>{gameType === 'streak' && <div className="streak"><span>🔥</span><strong>{session.currentStreak}</strong><span>连胜</span></div>}<div className="study-card"><span className="pill orange">第 {index + 1} / {session.questions.length} 题</span><div className="word">{question.word}</div><div className="phonetic">{gameType === 'root-chain' ? `构词线索 · ${question.prompt}` : question.phonetic}</div></div><div className="options">{question.options.map((option, optionIndex) => <button disabled={Boolean(feedback) || busy} className={`option ${feedback ? optionIndex === feedback.correct_answer ? 'correct' : optionIndex === selected ? 'wrong' : '' : selected === optionIndex ? 'selected' : ''}`} key={option} onClick={() => setSelected(optionIndex)}><span>{'ABCD'[optionIndex]}</span>{option}</button>)}</div>{errorMessage && <div className="sync-bar sync-failed"><b>!</b><span>{errorMessage}</span></div>}{!feedback ? <button className="primary" disabled={selected === null || busy} onClick={() => submit()}>{busy ? '提交中…' : '锁定首次答案'}</button> : <><div className={`answer-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`}><b>{feedback.correct ? '回答正确' : '需要订正'}</b><span>{feedback.explanation}</span></div><button className="primary" onClick={nextQuestion} disabled={busy}>{index === session.questions.length - 1 ? '结算本局' : '下一题'}</button></>}<p className="eyebrow" style={{ textAlign: 'center', marginTop: 14 }}>首次有效答案将立即锁定</p></PhoneShell>;
}

function TeamPage() {
  const [overview, setOverview] = useState<TeamOverview | null | undefined>(undefined);
  const [name, setName] = useState('六级上岸小队');
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const load = () => getMyTeam().then(result => setOverview(result.overview ?? null)).catch(cause => setMessage(cause instanceof Error ? cause.message : '小队加载失败。'));
  useEffect(() => { void load(); }, []);
  async function create() { try { await createTeam(name); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : '创建失败。'); } }
  async function join() { try { await joinTeam(invite); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : '加入失败。'); } }
  if (overview === undefined) return <PhoneShell active="team"><TopBar title="小队" /><div className="feature-card"><h3>正在读取小队状态</h3></div></PhoneShell>;
  if (!overview) return <PhoneShell active="team"><TopBar title="加入学习伙伴" subtitle="建议 2–6 人" /><div className="feature-card"><h3>创建自己的六级小队</h3><p>小队只展示有效学习积分，不公开私人错题和作品。</p></div><label className="field-label">小队名称</label><input className="form-input" value={name} onChange={event => setName(event.target.value)} /><button className="primary" onClick={create}>创建小队</button><div className="section-head"><h3>已有邀请码</h3></div><input className="form-input" value={invite} onChange={event => setInvite(event.target.value.toUpperCase())} placeholder="输入 8 位邀请码" /><button className="secondary" style={{ width: '100%' }} onClick={join}>加入小队</button>{message && <p className="sync-bar sync-failed">{message}</p>}</PhoneShell>;
  const teamPoints = overview.members.reduce((sum, member) => sum + member.points, 0);
  return <PhoneShell active="team"><TopBar title={overview.team.name} subtitle={`本周一 00:00 起 · ${overview.members.length} 位成员`} action="＋" /><section className="hero" style={{ background: 'linear-gradient(145deg,#2c2940,#4b4568)' }}><div className="hero-kicker">共同目标 · 本周 {overview.team.goalTarget} 人次打卡</div><h2>邀请码 {overview.team.inviteCode}</h2><p>邀请码有效期至 {new Date(overview.team.inviteExpiresAt).toLocaleDateString('zh-CN')}，学习积分不代表六级分数。</p><div className="hero-row"><div className="hero-progress"><div className="progress-label"><span>小队积分 {teamPoints}</span><span>{overview.members.length}/6 人</span></div><div className="track"><i style={{ width: `${Math.min(100, overview.members.length / 6 * 100)}%`, background: '#75e3bb' }} /></div></div></div></section><div className="section-head"><h3>本周小队榜</h3><span className="pill">同分并列</span></div><div className="leader-list">{overview.members.map((person, index) => <div className="leader" key={person.userId}><span className="rank">{index + 1}</span><i className="mini-avatar" style={{ margin: 0, border: 0, background: ['#ffd8a8', '#e5d6ff', '#c7ebff'][index % 3] }}>{person.nickname[0]}</i><span><strong>{person.nickname}</strong><small>{person.planTier === 'light' ? '轻量计划' : '标准计划'} · {person.role === 'owner' ? '队长' : '成员'}</small></span><span className="score">{person.points}</span></div>)}</div><button className="primary" onClick={() => go('challenge')}>查看异步挑战</button></PhoneShell>;
}

function ChallengePage() {
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [session, setSession] = useState<GameSessionResponse['session'] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在读取小队挑战…');
  const question = session?.questions[index];

  async function load() {
    try { const result = await getChallenges(); setChallenges(result.challenges); setMessage(result.challenges.length ? '' : '当前还没有挑战，可以发起第一场。'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '挑战加载失败。'); }
  }
  useEffect(() => { void load(); }, []);

  async function createNew() {
    setBusy(true);
    try { await createChallenge('flash', '周末单词闪答赛'); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '发起挑战失败。'); }
    finally { setBusy(false); }
  }

  async function start(challengeId: string) {
    setBusy(true);
    try { const result = await startChallenge(challengeId); setActiveId(challengeId); setSession(result.session); setIndex(0); setSelected(null); setAccepted(false); setMessage(result.duplicate ? '已恢复你唯一的一次计榜机会。' : '挑战已开始，答案在截止前不会揭晓。'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '挑战无法开始。'); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!question || selected === null) return;
    setBusy(true);
    try { await submitChallengeAnswer(activeId, question, selected, `${activeId}-${question.id}`); setAccepted(true); setMessage('首次答案已确认；截止前不显示得分和解析。'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '提交失败。'); }
    finally { setBusy(false); }
  }

  async function next() {
    if (!session) return;
    if (index < session.questions.length - 1) { setIndex(value => value + 1); setSelected(null); setAccepted(false); return; }
    setBusy(true);
    try { await finishChallenge(activeId); setSession(null); setMessage('挑战已提交。截止后再公布成绩与解析。'); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '挑战结算失败。'); }
    finally { setBusy(false); }
  }

  if (session && question) return <PhoneShell active="games"><DetailTop title="异步同题挑战" right="计榜" /><div className="question-progress">{session.questions.map((item, itemIndex) => <i key={item.id} className={itemIndex < index ? 'done' : itemIndex === index ? 'now' : ''} />)}</div><div className="study-card"><span className="pill orange">第 {index + 1} / {session.questions.length} 题</span><div className="word">{question.word}</div><div className="phonetic">{question.phonetic}</div></div><div className="options">{question.options.map((option, optionIndex) => <button disabled={accepted || busy} className={`option ${selected === optionIndex ? 'selected' : ''}`} key={option} onClick={() => setSelected(optionIndex)}><span>{'ABCD'[optionIndex]}</span>{option}</button>)}</div><div className="sync-bar" style={{ marginTop: 12 }}><b>◷</b><span>{message}</span></div>{accepted ? <button className="primary" onClick={next}>{index === session.questions.length - 1 ? '提交挑战' : '下一题'}</button> : <button className="primary" disabled={selected === null || busy} onClick={submit}>锁定计榜答案</button>}</PhoneShell>;

  return <PhoneShell active="games"><DetailTop title="好友挑战" /><div className="feature-card"><span className="pill">异步同题</span><h3 style={{ marginTop: 14 }}>每人只有一次计榜机会</h3><p>题目、规则和参与资格在开始时冻结；截止前只显示完成状态。</p></div>{challenges.map(challenge => <button className="game-card blue" key={challenge.id} onClick={() => start(challenge.id)} disabled={busy}><span className="game-num">VS</span><h3>{challenge.title}</h3><p>{challenge.gameType} · 截止 {new Date(challenge.deadlineAt).toLocaleString('zh-CN')}</p><span className="game-footer"><small>{challenge.status === 'open' ? '可参加' : '已截止'}</small><i className="play">▶</i></span></button>)}<button className="primary" onClick={createNew} disabled={busy}>发起单词闪答挑战</button>{message && <div className="sync-bar" style={{ marginTop: 12 }}><b>i</b><span>{message}</span></div>}</PhoneShell>;
}

function MePage({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return <PhoneShell active="me"><TopBar title="我的" subtitle="个人记录默认私有" action="⚙" /><div className="profile-card"><div className="avatar">{user.nickname[0] ?? '词'}</div><div><h2>{user.nickname}</h2><p>{user.planTier === 'standard' ? '标准计划' : user.planTier === 'light' ? '轻量计划' : '自定义计划'} · {user.email}</p></div></div><div className="section-head"><h3>学习资产</h3><button>导出记录</button></div><div className="metric-row"><div className="metric"><strong>286</strong><small>已学词汇</small></div><div className="metric"><strong>18</strong><small>收藏表达</small></div><div className="metric"><strong>9</strong><small>待订正</small></div></div><div className="section-head"><h3>设置与资料</h3></div><div className="menu-list"><button className="menu-item" onClick={() => go('upload')}><b>⇧</b><span>我的资料与上传</span><small>›</small></button><button className="menu-item" onClick={() => go('onboarding')}><b>◎</b><span>每日计划与考试目标</span><small>标准 ›</small></button>{user.role !== 'learner' && <button className="menu-item" onClick={() => go('admin')}><b>▦</b><span>内容管理后台</span><small>桌面端 ›</small></button>}<button className="menu-item" onClick={onLogout}><b>↪</b><span>退出登录</span><small>›</small></button></div></PhoneShell>;
}

function UploadPage() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('附件仅自己和审核人员可见。');
  const refresh = () => getImports().then(result => setItems(result.imports)).catch(cause => setMessage(cause instanceof Error ? cause.message : '上传记录读取失败。'));
  useEffect(() => { void refresh(); }, []);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage('正在校验文件内容并安全上传…');
    try {
      await uploadPrivateFile(file);
      setMessage('上传完成，已进入人工整理队列。');
      await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '上传失败。'); } finally { setBusy(false); }
  }
  return <PhoneShell active="me"><DetailTop title="我的资料" /><div className="feature-card"><span className="pill mint">私有附件</span><h3 style={{ marginTop: 18 }}>上传图片、PDF 或音频</h3><p>{message}</p><label className={`upload-drop ${busy ? 'disabled' : ''}`}><input type="file" accept="image/jpeg,image/png,application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" disabled={busy} onChange={event => upload(event.target.files?.[0])} /><b>{busy ? '上传中…' : '选择文件'}</b><small>图片 10MB · PDF 20MB · 音频 50MB</small></label></div><div className="section-head"><h3>处理记录</h3><button onClick={refresh}>刷新</button></div><div className="menu-list">{items.length ? items.map(item => <div className="menu-item" key={item.import.id}><b>⇧</b><span><strong>{item.asset.originalName}</strong><small>{(item.asset.byteSize / 1024 / 1024).toFixed(2)} MB · {item.import.status}</small></span><i className="pill">{item.import.status}</i></div>) : <div className="feature-card"><p>还没有上传记录。</p></div>}</div></PhoneShell>;
}

function PlanSettingsPage({ user }: { user: CurrentUser }) {
  const [tier, setTier] = useState<TodayPlanResponse['plan_tier']>(user.planTier);
  const [examDate, setExamDate] = useState('');
  const [message, setMessage] = useState('修改会从北京时间次日开始生效。');
  async function save() {
    try { const result = await updatePlan(tier, examDate || undefined); setMessage(`已保存，将于 ${result.effective_date} 生效。`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '保存失败。'); }
  }
  return <PhoneShell noNav><DetailTop title="每日计划设置" /><div className="feature-card"><h3>选择适合你的节奏</h3><p>{message}</p><div className="chips">{([['light', '轻量'], ['standard', '标准'], ['custom', '自定义']] as const).map(item => <button className={`chip ${tier === item[0] ? 'active' : ''}`} key={item[0]} onClick={() => setTier(item[0])}>{item[1]}</button>)}</div><label className="field-label">考试日期（可选）</label><input className="form-input" type="date" value={examDate} onChange={event => setExamDate(event.target.value)} /></div><button className="primary" onClick={save}>保存，次日生效</button></PhoneShell>;
}

function AdminPage({ user }: { user: CurrentUser }) {
  const [content, setContent] = useState<ManagedContent[]>([]);
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [message, setMessage] = useState('');
  const refresh = () => Promise.all([getManagedContent(), getImports(true)]).then(([managed, uploaded]) => { setContent(managed.content); setImports(uploaded.imports); }).catch(cause => setMessage(cause instanceof Error ? cause.message : '后台数据读取失败。'));
  useEffect(() => { void refresh(); }, []);
  async function createSample() {
    try { await createManagedContent('word', { word: 'sustainable', meaning: '可持续的', source: 'CET6 Buddy 原创试用内容' }); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '创建失败。'); }
  }
  async function changeStatus(item: ManagedContent, action: 'publish' | 'withdraw') {
    try { await setManagedContentStatus(item.id, action); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '状态更新失败。'); }
  }
  if (user.role === 'learner') return <PhoneShell noNav><DetailTop title="无权访问" /><div className="feature-card"><h3>需要编辑或管理员权限</h3><p>后台权限由服务端校验，隐藏按钮不能绕过。</p></div></PhoneShell>;
  return <div className="admin-shell"><aside className="admin-side"><div className="logo"><i className="logo-mark">B</i>CET6 Buddy</div>{['概览', '内容库', '题组管理', '资料导入', '音频资源', '发布记录', '权限与审计'].map((item, index) => <span className={`admin-link ${index === 1 ? 'active' : ''}`} key={item}>{item}</span>)}<button className="admin-link" onClick={() => go('me')}>← 返回手机端</button></aside><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">内容管理后台 · {user.role}</p><h1>内容库</h1><small>{message}</small></div><button className="secondary" onClick={createSample}>＋ 新建示例词汇</button></div><div className="admin-stats">{[['已发布', content.filter(item => item.status === 'published').length], ['待检查', imports.filter(item => !['published', 'withdrawn'].includes(item.import.status)).length], ['内容版本', content.length], ['私有附件', imports.length]].map(item => <div className="admin-stat" key={item[0]}><span className="pill">{item[0]}</span><strong>{item[1]}</strong><small>条记录</small></div>)}</div><div className="data-table"><div className="data-row header"><span>内容名称</span><span>类型</span><span>状态</span><span>版本</span><span>操作</span></div>{content.map(item => <div className="data-row" key={item.id}><strong>{String(item.payload.title ?? item.payload.word ?? item.payload.prompt ?? item.id)}</strong><span>{item.kind}</span><span><i className="pill">{item.status}</i></span><span>v{item.version}</span><button className="text-link" onClick={() => changeStatus(item, item.status === 'published' ? 'withdraw' : 'publish')}>{item.status === 'published' ? '下架' : '发布'}</button></div>)}</div>{imports.length > 0 && <><div className="section-head"><h3>资料导入</h3></div><div className="data-table">{imports.map(item => <div className="data-row" key={item.import.id}><strong>{item.asset.originalName}</strong><span>{item.asset.mimeType}</span><span><i className="pill">{item.import.status}</i></span><span>{(item.asset.byteSize / 1024).toFixed(0)} KB</span><button className="text-link" onClick={async () => { await updateImportStatus(item.import.id, item.import.status === 'uploaded' ? 'draft' : 'review'); await refresh(); }}>推进审核</button></div>)}</div></>}</main></div>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null | undefined>(undefined);
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

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const completedNewWords = useMemo(() => result?.total ?? 0, [result]);

  function finishSession(nextResult: SessionResult) {
    setResult(nextResult);
    localStorage.setItem('cet6:lastResult', JSON.stringify(nextResult));
    go('result');
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    setCurrentUser(null);
    go('login');
  }

  if (currentUser === undefined) return <PhoneShell noNav><StatusBar /><div className="feature-card"><h3>正在恢复登录状态</h3><p>正在安全读取你的学习账号…</p></div></PhoneShell>;
  if (!currentUser || route === 'login') return <LoginPage onAuthenticated={user => { setCurrentUser(user); go('today'); }} />;

  if (route === 'admin') return <AdminPage user={currentUser} />;
  if (route === 'today') return <TodayPage completedNewWords={completedNewWords} />;
  if (route === 'study') return <StudyPage />;
  if (route === 'word') return <WordSession key={sessionKey} onFinish={finishSession} />;
  if (route === 'result') return <ResultPage result={result} onRestart={() => { setSessionKey(value => value + 1); go('word'); }} />;
  if (['listening', 'reading', 'translation', 'writing'].includes(route)) return <LearningDetail route={route} />;
  if (route === 'games') return <GamesPage />;
  if (['rootgame', 'flashgame', 'streakgame'].includes(route)) return <GameDetail route={route} />;
  if (route === 'team') return <TeamPage />;
  if (route === 'challenge') return <ChallengePage />;
  if (route === 'me') return <MePage user={currentUser} onLogout={handleLogout} />;
  if (route === 'upload') return <UploadPage />;
  if (route === 'onboarding') return <PlanSettingsPage user={currentUser} />;
  return <PhoneShell noNav><DetailTop title="页面不存在" /><div className="feature-card"><p>请返回首页继续学习。</p></div></PhoneShell>;
}
