import { OutputPage } from './pages/OutputPage';
import { ContentEditor } from './components/ContentEditor';
import { useEffect, useRef, useState } from 'react';
import { DashboardProvider, DetailTop, Icon, PhoneShell, TopBar, useDashboard } from './components/AppShell';
import { TodayPage, StudyPage, TeamPage, MePage } from './pages/DashboardPages';
import { addCollection, createChallenge, createGameSession,  createManagedUser, createStudySession, finishChallenge, finishGame, finishStudySession, getChallenges, getCurrentUser, getImports, getManagedContent, getManagedUsers, logout, resetManagedUserPassword, resumeStudySession,  startChallenge, submitChallengeAnswer, submitGameAnswer, submitSessionAnswer, submitSpellingAttempt, updateImportStatus, updatePlan, uploadPrivateFile, type ChallengeSummary, type GameSessionResponse, type GameType, type ImportItem, type ManagedContent, type ManagedUser, type TodayPlanResponse } from './api';
import type { Attempt, CurrentUser, Question, Route, SessionResult, SyncState } from './types';
import { LoginPage } from './pages/LoginPage';
import { getRoute, go, routeParams } from './navigation';

function SyncBanner({ state }: { state: SyncState }) {
  const content = {
    synced: ['☁', '学习记录已由服务器确认，本设备可以安全继续。'],
    submitting: ['↻', '正在提交答案，请不要重复点击。'],
    pending: ['◷', '当前记录待同步，确认前不会显示积分到账。'],
    failed: ['!', '保存失败，答案仍保留在本机。请重试。'],
  }[state];
  return <div className={`sync-bar sync-${state}`}><b>{content[0]}</b><span>{content[1]}</span></div>;
}

interface WordSessionProps {
  onFinish: (result: SessionResult) => void;
}

function WordSession({ onFinish }: WordSessionProps) {
  const { user } = useDashboard();
  const source = routeParams().get('source') === 'due_reviews' ? 'due_reviews' : 'new_words';
  const contentId = routeParams().get('content') ?? undefined;
  const sessionStorageKey = `cet6:${user?.id}:study:${source}:${contentId ?? 'all'}`;
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sync, setSync] = useState<SyncState>('pending');
  const [feedback, setFeedback] = useState<{ attempt: Attempt; correctAnswer: number; explanation: string } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [spelling, setSpelling] = useState('');
  const [spellingSaved, setSpellingSaved] = useState(false);
  const [spellingBusy, setSpellingBusy] = useState(false);
  const [spellingMessage, setSpellingMessage] = useState('');
  const [collectionMessage, setCollectionMessage] = useState('');
  const question = questions[index];

  useEffect(() => {
    let active = true;
    const savedSession = localStorage.getItem(sessionStorageKey);
    const create = () => createStudySession(source, contentId);
    const restore = savedSession ? resumeStudySession(savedSession) : create();
    restore
      .then(response => {
        if (!active) return;
        setSessionId(response.session.id);
        setQuestions(response.session.questions);
        setIndex('attempts' in response && Array.isArray(response.attempts) ? response.attempts.length : 0);
        if ('attempts' in response && Array.isArray(response.attempts)) setAttempts(response.attempts);
        localStorage.setItem(sessionStorageKey, response.session.id);
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
      setSpelling('');
      setSpellingMessage('');
      setSpellingSaved(false);
      return;
    }
    setSync('submitting');
    try {
      const finished = await finishStudySession(sessionId);
      localStorage.removeItem(sessionStorageKey);
      const needsReview = attempts.filter(attempt => !attempt.correct).map(attempt => questions.find(item => item.id === attempt.questionId)?.word ?? attempt.questionId);
      onFinish({ attempts, correct: finished.result.correct, total: finished.result.total, score: finished.result.score, needsReview, reward: finished.reward });
    } catch {
      setSync('failed');
    }
  }

  if (!question) {
    if (sessionId && questions.length && attempts.length === questions.length) return <PhoneShell active="study"><DetailTop title="完成本次练习"/><p>首次答案已保存，请继续结算。</p><SyncBanner state={sync}/><button className="primary" disabled={sync === 'submitting'} onClick={next}>{sync === 'submitting' ? '正在结算…' : '重试结算'}</button></PhoneShell>;
    return <PhoneShell active="study"><DetailTop title={source === 'due_reviews' ? '到期复习' : '单词学习'} /><SyncBanner state={sync} /><div className="feature-card"><h3>{loadError ? '学习服务暂时不可用' : '正在创建学习会话'}</h3><p>{loadError || '正在冻结题目版本并读取到期复习内容…'}</p></div>{loadError && <button className="primary" onClick={() => window.location.reload()}>重新连接</button>}</PhoneShell>;
  }

  return <PhoneShell active="study"><DetailTop title={source === 'due_reviews' ? '到期复习' : '单词学习'} />
    {routeParams().get('skill') === 'spelling' && <p className="list-note">本条为拼写复习。请在识义后完成下方独立拼写；只做识义不会完成拼写复习。</p>}
    {sync !== 'synced' && <SyncBanner state={sync} />}
    <div className="question-progress">{questions.map((item, itemIndex) => <i key={item.id} className={itemIndex < index ? 'done' : itemIndex === index ? 'now' : ''} />)}</div>
    <div className="study-card"><span className="pill mint">{source === 'due_reviews' ? '到期复习' : '单词学习'} · 识义</span><div className="word">{question.word}</div><div className="phonetic">{question.phonetic}</div><div className="hint-box"><b>{question.prompt}</b><br />{hintVisible ? (question.hint ?? '回忆常见搭配和具体语境。') : '先在脑中回忆，再选择答案。词根只作为辅助线索。'}</div></div>
    <button className="text-link" style={{ display: 'block', margin: '14px auto' }} onClick={() => void addCollection(question.contentItemId ?? question.id, question.version, 'word').then(() => setCollectionMessage('已收藏')).catch(() => setCollectionMessage('收藏失败，请重试'))}>{collectionMessage || '收藏这个单词'}</button>
    <div className="options">{question.options.map((option, optionIndex) => { const answerClass = feedback ? optionIndex === feedback.correctAnswer ? 'correct' : optionIndex === feedback.attempt.answerIndex ? 'wrong' : '' : selected === optionIndex ? 'selected' : ''; return <button disabled={Boolean(feedback)} className={`option ${answerClass}`} key={option} onClick={() => setSelected(optionIndex)}><span>{'ABCD'[optionIndex]}</span>{option}</button>; })}</div>
    {!feedback ? <><button className="primary" disabled={selected === null || sync === 'submitting'} onClick={handleSubmit}>{sync === 'submitting' ? '提交中…' : '确认答案'}</button><button className="text-link" style={{ display: 'block', margin: '15px auto' }} onClick={() => setHintVisible(true)}>看提示后作答</button></> : <><div className={`answer-feedback ${feedback.attempt.correct ? 'is-correct' : 'is-wrong'}`}><b>{feedback.attempt.correct ? '回答正确' : '需要订正'}</b><span>{feedback.attempt.correct ? '首次答案已由服务器确认。' : `正确答案：${question.options[feedback.correctAnswer]}`}</span></div><div className="hint-box" style={{ marginTop: 10 }}>{feedback.explanation}</div><label className="field-label">独立拼写复习</label><div style={{ display: 'flex', gap: 8 }}><input className="form-input" style={{ margin: 0 }} value={spelling} onChange={event => setSpelling(event.target.value)} placeholder="输入英文单词" disabled={spellingSaved || spellingBusy} /><button className="secondary" disabled={!spelling.trim() || spellingSaved || spellingBusy} onClick={() => { setSpellingBusy(true); void submitSpellingAttempt(question, spelling, `${sessionId}:${question.id}:spelling`, sessionId).then(result => { setSpellingSaved(true); setSpellingMessage(result.feedback.correct ? '拼写正确' : `正确拼写：${result.feedback.correct_answer}`); }).catch(cause => setSpellingMessage(cause instanceof Error ? cause.message : '拼写保存失败，请重试')).finally(() => setSpellingBusy(false)); }}>提交</button></div>{spellingMessage && <p className="eyebrow">{spellingMessage}</p>}<button className="primary" onClick={next} disabled={sync === 'submitting'}>{sync === 'submitting' ? '正在结算…' : index === questions.length - 1 ? '查看本次结果' : '下一词'}</button></>}
  </PhoneShell>;
}

function ResultPage({ result, onRestart }: { result: SessionResult | null; onRestart: () => void }) {
  if (!result) return <PhoneShell noNav><div className="feature-card"><h3>暂时没有练习结果</h3><p>完成一组单词复习后，这里会显示首次正确率和订正建议。</p></div><button className="primary" onClick={() => go('word')}>开始复习</button></PhoneShell>;
  return <PhoneShell noNav><div style={{ textAlign: 'center', paddingTop: 40 }}><div style={{ fontSize: 70 }}>{result.correct === result.total ? '🎉' : '🌱'}</div><p className="eyebrow">本组已由服务器确认</p><h1 style={{ fontSize: 30, margin: 8 }}>{result.correct} / {result.total} 题正确</h1><p style={{ color: 'var(--muted)' }}>单词识义 · {result.score} 局内分</p></div><div className="metric-row" style={{ marginTop: 28 }}><div className="metric"><strong>{result.score}</strong><small>本组得分</small></div><div className="metric"><strong>{Math.round(result.correct / result.total * 100)}%</strong><small>首次正确率</small></div><div className="metric"><strong>{result.needsReview.length}</strong><small>需要复习</small></div></div>{result.reward && <SyncBanner state="synced" />}<div className="feature-card"><h3>下一步建议</h3><p>{result.needsReview.length ? `先订正 ${result.needsReview.join('、')}，它们会回到短间隔复习队列。` : '本组全部正确。明天仍会按复习间隔安排回忆，避免只凭熟悉感判断掌握。'}</p>{result.reward && <p><b>{result.reward.awarded ? `今日学习积分 +${result.reward.points}` : result.reward.reason ?? '今日该项任务积分已领取，不重复发放'}</b></p>}</div><button className="primary" onClick={onRestart}>再练一组</button><button className="secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => go('today')}>返回今日</button></PhoneShell>;
}

function LearningDetail({ route }: { route: Route }) {
  const { user } = useDashboard();
  const content: Record<string, { title: string; tag: string; headline: string; body: string; action: string }> = {
    listening: { title: '听力练习', tag: '练习模式 · 保留播放位置', headline: 'What does the woman suggest?', body: '支持暂停、倍速、重复与段落循环。答案提交后再展示解析和相关原文。', action: '播放当前段落' },
    reading: { title: '仔细阅读', tag: '已发布题组 · 服务端判分', headline: 'Why Small Habits Matter', body: '文章与题目可切换查看。作答后可标记支持答案的证据句，并收藏词句。', action: '查看第 2 题' },
  };
  const item = content[route];
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const [saved, setSaved] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const [inputSessionId, setInputSessionId] = useState('');
  const [inputQuestions, setInputQuestions] = useState<Question[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const inputQuestion = inputQuestions[inputIndex] ?? null;
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [inputExplanation, setInputExplanation] = useState('');
  const [inputBusy, setInputBusy] = useState(false);
  const [finishPending, setFinishPending] = useState(false);
  const inputStorageKey = `cet6:${user?.id}:input:${route}:${routeParams().get('content') ?? ''}`;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (route !== 'listening' || !inputQuestion?.audioUrl) return;
    const audio = new Audio(inputQuestion.audioUrl.startsWith('/api/') ? `${inputQuestion.audioUrl}?session_id=${inputSessionId}` : inputQuestion.audioUrl);
    const positionKey = `cet6:${user?.id}:listening:${inputQuestion.contentItemId}:${inputQuestion.version}:position`;
    audio.preload = 'metadata';
    audio.playbackRate = rate;
    audio.onloadedmetadata = () => { const savedPosition = Number(localStorage.getItem(positionKey) ?? 0); if (savedPosition > 0 && savedPosition < audio.duration) audio.currentTime = savedPosition; };
    audio.ontimeupdate = () => localStorage.setItem(positionKey, String(audio.currentTime));
    audio.onended = () => { setSpeaking(false); localStorage.removeItem(positionKey); };
    audio.onerror = () => { setSpeaking(false); setSaved('音频加载失败，计时未开始；可以重试或稍后继续。'); };
    audioRef.current = audio;
    return () => { audio.pause(); audioRef.current = null; };
  }, [route, inputQuestion?.audioUrl, inputSessionId]);
  useEffect(() => {
    if (route !== 'listening' && route !== 'reading') return;
    setSelected(null);
    setSubmitted(false);
    setInputExplanation('');
    setInputQuestions([]); setInputIndex(0); setCorrectIndex(null);
    let active = true;
    const create = () => createStudySession(route, routeParams().get('content') ?? undefined);
    const savedId = localStorage.getItem(inputStorageKey);
    const load = savedId ? resumeStudySession(savedId) : create();
    load.then(result => {
      if (!active) return;
      setInputSessionId(result.session.id); setInputQuestions(result.session.questions);
      localStorage.setItem(inputStorageKey, result.session.id);
      if ('attempts' in result && Array.isArray(result.attempts)) {
        const count = result.attempts.length;
        setInputIndex(Math.min(count, result.session.questions.length - 1));
        if (count === result.session.questions.length) { setSubmitted(true); setFinishPending(true); setSaved('首次答案已保存，请继续结算。'); }
      }
    }).catch(cause => { if (active) setSaved(cause instanceof Error ? cause.message : '题目加载失败。'); });
    return () => { active = false; };
  }, [route]);
  function toggleListening() {
    const audio = audioRef.current;
    if (!audio) return setSaved('音频仍在准备，请稍后重试。');
    if (!audio.paused) { audio.pause(); setSpeaking(false); return; }
    audio.playbackRate = rate;
    audio.play().then(() => setSpeaking(true)).catch(() => setSaved('音频播放失败，计时未开始；请检查网络或浏览器权限。'));
  }

  async function settleInput() {
    setFinishPending(true);
    await finishStudySession(inputSessionId);
    localStorage.removeItem(inputStorageKey);
    setFinishPending(false);
    setSaved('本组练习已结算，任务进度和统计已更新。');
  }

  async function retryInputFinish() {
    if (inputBusy) return;
    setInputBusy(true); setSaved('');
    try { await settleInput(); }
    catch (cause) { setSaved(cause instanceof Error ? cause.message : '结算失败，请重试。'); }
    finally { setInputBusy(false); }
  }

  async function submitInputAnswer() {
    if (!inputSessionId || !inputQuestion || selected === null || inputBusy || submitted) return;
    setInputBusy(true); setSaved('');
    try {
      const result = await submitSessionAnswer(inputSessionId, inputQuestion, selected, `${inputSessionId}:${inputQuestion.id}`);
      setSubmitted(true);
      setCorrectIndex(result.feedback?.correct_answer ?? null);
      setInputExplanation(result.feedback?.explanation ?? '首次答案已由服务器确认。');
      if (inputIndex === inputQuestions.length - 1) await settleInput();
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : '答案同步失败，请重试。'); }
    finally { setInputBusy(false); }
  }

  const options = inputQuestion?.options ?? [];

  return <PhoneShell active="study"><DetailTop title={item.title} /><div className="feature-card"><span className="pill">{item.tag}</span><h3 style={{ fontSize: 22, lineHeight: 1.45, marginTop: 18 }}>{inputQuestion?.prompt ?? (saved ? '当前内容不可用' : '正在加载题库…')}</h3><p>{inputQuestion?.source ?? item.body}</p></div>
    {route === 'listening' && <><div className="audio-player" style={{ marginTop: 14 }}><div className="wave">{[18, 28, 42, 22, 49, 34, 26, 45, 19, 38, 51, 29].map((height, index) => <i key={index} style={{ height }} />)}</div><div className="player-row"><button className="text-link" onClick={() => setRate(value => { const next = value === 1 ? 1.25 : value === 1.25 ? 1.5 : 1; if (audioRef.current) audioRef.current.playbackRate = next; return next; })}>{rate.toFixed(2)}×</button><button className="player-control" aria-label={speaking ? '暂停' : '播放'} onClick={toggleListening}><Icon name={speaking ? 'pause' : 'play'}/></button><button className="text-link" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play().then(() => setSpeaking(true)); } }}>重播</button></div></div><div className="options">{options.map((option, index) => <button disabled={submitted || inputBusy} className={`option ${submitted ? index === correctIndex ? 'correct' : index === selected ? 'wrong' : '' : selected === index ? 'selected' : ''}`} key={option} onClick={() => setSelected(index)}><span>{'ABCD'[index]}</span>{option}</button>)}</div><button className="primary" disabled={!inputQuestion || selected === null || submitted || inputBusy} onClick={submitInputAnswer}>提交听力答案</button>{submitted && <div className="answer-feedback is-correct"><b>{selected === correctIndex ? '首次作答正确' : '已保存首次答案'}</b><span>{inputExplanation}</span></div>}</>}
    {route === 'reading' && <><div className="segmented"><button className={showPassage ? 'active' : ''} onClick={() => setShowPassage(true)}>文章</button><button className={!showPassage ? 'active' : ''} onClick={() => setShowPassage(false)}>题目</button></div>{showPassage ? <div className="passage"><h3>{inputQuestion?.word}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{inputQuestion?.passage}</p></div> : <><div className="options">{options.map((option, index) => <button disabled={submitted || inputBusy} className={`option ${submitted ? index === correctIndex ? 'correct' : index === selected ? 'wrong' : '' : selected === index ? 'selected' : ''}`} key={option} onClick={() => setSelected(index)}><span>{'ABCD'[index]}</span>{option}</button>)}</div><button className="primary" disabled={!inputQuestion || selected === null || submitted || inputBusy} onClick={submitInputAnswer}>提交阅读答案</button>{submitted && <div className="hint-box" style={{ marginTop: 12 }}><b>解析：</b> {inputExplanation}</div>}</>}</>}
    {submitted && inputQuestion && inputIndex < inputQuestions.length - 1 && <button className="primary" onClick={() => { setInputIndex(inputIndex + 1); setSelected(null); setSubmitted(false); setCorrectIndex(null); setInputExplanation(''); }}>下一题（{inputIndex + 2}/{inputQuestions.length}）</button>}
    {finishPending && <button className="primary" disabled={inputBusy} onClick={retryInputFinish}>{inputBusy ? '正在结算…' : '重试结算'}</button>}
    {saved && <div className="sync-bar" role="status" style={{ marginTop: 12 }}><span>{saved}</span></div>}
    <button className="text-link" disabled={!inputQuestion} style={{ display: 'block', margin: '16px auto' }} onClick={() => addCollection(inputQuestion?.contentItemId ?? '', inputQuestion?.version ?? 1, route).then(() => setSaved('已加入个人收藏。')).catch(() => setSaved('收藏失败，请稍后重试。'))}>☆ 收藏本条内容</button>
  </PhoneShell>;
}

function GamesPage() {
  const games = [
    ['rootgame', 'purple', '01', '词根串串', '先理解构词线索，再完成辨义、语境与回忆。', '不限时 · 满分 50'],
    ['flashgame', 'blue', '02', '单词闪答', '大单词、音标与四选一；音频未就绪不会消耗时间。', '10 题 · 12 秒/题'],
    ['streakgame', 'orange', '03', '例句连胜', '从真实语境判断词义，连续答对获得额外局内分。', '10 题 · 最高 115'],
  ] as const;
  return <PhoneShell active="games"><TopBar title="闯关" subtitle="小游戏得分与学习积分分开记录" action="⚙" /><div className="chips"><button className="chip active">单人练习</button><button className="chip" onClick={() => go('challenge')}>好友挑战</button></div><div className="section-head"><h3>选择玩法</h3><span className="pill orange">每日最多 +5</span></div>{games.map(game => <button className={`game-card ${game[1]}`} key={game[0]} onClick={() => go(game[0])}><span className="game-num">{game[2]}</span><h3>{game[3]}</h3><p>{game[4]}</p><span className="game-footer"><small>{game[5]}</small><span className="play"><Icon name="play"/></span></span></button>)}</PhoneShell>;
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

  return <PhoneShell active="games"><DetailTop title="好友挑战" /><div className="feature-card"><span className="pill">异步同题</span><h3 style={{ marginTop: 14 }}>每人只有一次计榜机会</h3><p>题目、规则和参与资格在开始时冻结；截止前只显示完成状态。</p></div>{challenges.map(challenge => <button className="game-card blue" key={challenge.id} onClick={() => start(challenge.id)} disabled={busy}><span className="game-num">VS</span><h3>{challenge.title}</h3><p>{challenge.gameType} · 截止 {new Date(challenge.deadlineAt).toLocaleString('zh-CN')}</p><span className="game-footer"><small>{challenge.status === 'open' ? '可参加' : '已截止'}</small><span className="play"><Icon name="play"/></span></span></button>)}<button className="primary" onClick={createNew} disabled={busy}>发起单词闪答挑战</button>{message && <div className="sync-bar" style={{ marginTop: 12 }}><b>i</b><span>{message}</span></div>}</PhoneShell>;
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
  return <PhoneShell active="me"><DetailTop title="我的资料" /><div className="feature-card"><span className="pill mint">私有附件</span><h3 style={{ marginTop: 18 }}>上传图片、PDF 或音频</h3><p>{message}</p><label className={`upload-drop ${busy ? 'disabled' : ''}`}><input type="file" accept="image/jpeg,image/png,application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" disabled={busy} onChange={event => upload(event.target.files?.[0])} /><b>{busy ? '上传中…' : '选择文件'}</b><small>图片 10MB · PDF 20MB · 音频 50MB</small></label></div><div className="section-head"><h3>处理记录</h3><button onClick={refresh}>刷新</button></div><div className="menu-list">{items.length ? items.map(item => <div className="menu-item" key={item.import.id}><b>⇧</b><span><strong>{item.asset.originalName}<small style={{ display: 'block', overflowWrap: 'anywhere' }}>资源 ID：{item.asset.id}</small></strong><small>{(item.asset.byteSize / 1024 / 1024).toFixed(2)} MB · {item.import.status}</small></span><i className="pill">{item.import.status}</i></div>) : <div className="feature-card"><p>还没有上传记录。</p></div>}</div></PhoneShell>;
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
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [newUser, setNewUser] = useState({ username: '', email: '', nickname: '', role: 'learner' as CurrentUser['role'] });
  const [message, setMessage] = useState('');
  const refresh = () => Promise.all([getManagedContent(), getImports(true), user.role === 'admin' ? getManagedUsers() : Promise.resolve({ users: [] })]).then(([managed, uploaded, managedUsers]) => { setContent(managed.content); setImports(uploaded.imports); setUsers(managedUsers.users); }).catch(cause => setMessage(cause instanceof Error ? cause.message : '后台数据读取失败。'));
  useEffect(() => { void refresh(); }, []);
  async function addUser() {
    try {
      const result = await createManagedUser(newUser);
      setMessage(`账号 ${result.user.username} 已创建。临时密码：${result.temporary_password}（仅显示在此，请安全转交）`);
      setNewUser({ username: '', email: '', nickname: '', role: 'learner' });
      await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '账号创建失败。'); }
  }
  async function resetPassword(item: ManagedUser) {
    try {
      const result = await resetManagedUserPassword(item.id);
      setMessage(`账号 ${item.username} 已重置。临时密码：${result.temporary_password}（旧会话已退出）`);
      await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '密码重置失败。'); }
  }
  if (user.role === 'learner') return <PhoneShell noNav><DetailTop title="无权访问" /><div className="feature-card"><h3>需要编辑或管理员权限</h3><p>后台权限由服务端校验，隐藏按钮不能绕过。</p></div></PhoneShell>;
  return <div className="admin-shell"><aside className="admin-side"><div className="logo"><i className="logo-mark">B</i>CET6 Buddy</div>{['概览', '账号管理', '内容库', '题组管理', '资料导入', '音频资源', '发布记录', '权限与审计'].map((item, index) => <span className={`admin-link ${index === 1 ? 'active' : ''}`} key={item}>{item}</span>)}<button className="admin-link" onClick={() => go('me')}>← 返回手机端</button></aside><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">管理后台 · {user.role}</p><h1>账号与内容</h1><small>{message}</small></div><a className="secondary" href="#content-editor" onClick={e => { e.preventDefault(); document.getElementById('content-editor')?.scrollIntoView({ behavior: 'smooth' }); }}>录入题目 ↓</a></div><div className="admin-stats">{[['用户账号', users.length], ['已发布', content.filter(item => item.status === 'published').length], ['待检查', imports.filter(item => !['published', 'withdrawn'].includes(item.import.status)).length], ['私有附件', imports.length]].map(item => <div className="admin-stat" key={item[0]}><span className="pill">{item[0]}</span><strong>{item[1]}</strong><small>条记录</small></div>)}</div>{user.role === 'admin' && <><div className="section-head"><h3>创建试用账号</h3><span className="pill mint">首次登录强制改密</span></div><div className="feature-card"><div className="admin-user-form"><input className="form-input" value={newUser.username} onChange={event => setNewUser(value => ({ ...value, username: event.target.value.toLowerCase() }))} placeholder="用户名，如 xiaolin" /><input className="form-input" type="email" value={newUser.email} onChange={event => setNewUser(value => ({ ...value, email: event.target.value }))} placeholder="邮箱，仅作为登录标识" /><input className="form-input" value={newUser.nickname} onChange={event => setNewUser(value => ({ ...value, nickname: event.target.value }))} placeholder="昵称" /><select className="form-input" value={newUser.role} onChange={event => setNewUser(value => ({ ...value, role: event.target.value as CurrentUser['role'] }))}><option value="learner">学习者</option><option value="editor">内容编辑</option><option value="admin">管理员</option></select><button className="primary" disabled={!newUser.username || !newUser.email || !newUser.nickname} onClick={addUser}>创建并生成临时密码</button></div></div><div className="data-table"><div className="data-row header"><span>账号</span><span>角色</span><span>状态</span><span>首次改密</span><span>操作</span></div>{users.map(item => <div className="data-row" key={item.id}><strong>{item.username}<small>{item.email}</small></strong><span>{item.role}</span><span>{item.status}</span><span>{item.mustChangePassword ? '待完成' : '已完成'}</span><button className="text-link" onClick={() => resetPassword(item)}>重置密码</button></div>)}</div></>}<div className="section-head"><h3>内容库</h3></div><div id="content-editor"><ContentEditor /></div>{imports.length > 0 && <><div className="section-head"><h3>资料导入</h3></div><div className="data-table">{imports.map(item => <div className="data-row" key={item.import.id}><strong>{item.asset.originalName}</strong><span>{item.asset.mimeType}</span><span><i className="pill">{item.import.status}</i></span><span>{(item.asset.byteSize / 1024).toFixed(0)} KB</span><button className="text-link" onClick={async () => { await updateImportStatus(item.import.id, item.import.status === 'uploaded' ? 'draft' : 'review'); await refresh(); }}>推进审核</button></div>)}</div></>}</main></div>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null | undefined>(undefined);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    const handleHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    setResult(null);
    // Legacy unscoped summaries are not trusted across accounts.
    localStorage.removeItem('cet6:lastResult');
    localStorage.removeItem('cet6:activeStudySession');
  }, [currentUser?.id]);

  function finishSession(nextResult: SessionResult) {
    setResult(nextResult);
    go('result');
  }

  async function handleLogout() {
    try { await logout(); } catch { window.alert('退出失败，请检查网络后重试。'); return; }
    setResult(null);
    setCurrentUser(null);
    go('login');
  }

  if (currentUser === undefined) return <PhoneShell noNav><div className="feature-card"><h3>正在恢复登录状态</h3><p>正在安全读取你的学习账号…</p></div></PhoneShell>;
  if (!currentUser || route === 'login' || currentUser.mustChangePassword) return <LoginPage pendingUser={currentUser?.mustChangePassword ? currentUser : undefined} onAuthenticated={user => { setCurrentUser(user); go('today'); }} />;

  const page = (() => {
  if (route === 'admin') return <AdminPage user={currentUser} />;
  if (route === 'today') return <TodayPage user={currentUser} />;
  if (route === 'study') return <StudyPage />;
  if (route === 'word') return <WordSession key={sessionKey} onFinish={finishSession} />;
  if (route === 'result') return <ResultPage result={result} onRestart={() => { setSessionKey(value => value + 1); go('word'); }} />;
  if (route === 'translation' || route === 'writing') return <OutputPage key={route} kind={route} />;
  if (route === 'listening' || route === 'reading') return <LearningDetail key={route} route={route} />;
  if (route === 'games') return <GamesPage />;
  if (['rootgame', 'flashgame', 'streakgame'].includes(route)) return <GameDetail route={route} />;
  if (route === 'team') return <TeamPage user={currentUser} />;
  if (route === 'challenge') return <ChallengePage />;
  if (route === 'me') return <MePage user={currentUser} onLogout={handleLogout} />;
  if (route === 'upload') return <UploadPage />;
  if (route === 'onboarding') return <PlanSettingsPage user={currentUser} />;
  return <PhoneShell noNav><DetailTop title="页面不存在" /><div className="feature-card"><p>请返回首页继续学习。</p></div></PhoneShell>;
  })();
  return <DashboardProvider key={currentUser.id} user={currentUser}>{page}</DashboardProvider>;
}
