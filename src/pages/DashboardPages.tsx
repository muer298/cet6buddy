import { useEffect, useState } from 'react';
import { correctAttempt, createCheckin, createTeam, getLearningItems, getLearningSummary, getTodayPlan, joinTeam, sendTeamReaction, type LearningItem, type LearningList, type LearningSummary, type TodayPlanResponse } from '../api';
import { PhoneShell, TopBar, Icon, useDashboard } from '../components/AppShell';
import { go, routeParams } from '../navigation';
import type { CurrentUser, Route } from '../types';

const tierName = { light: '轻量计划', standard: '标准计划', custom: '自定义计划' };
const kindName: Record<string, string> = { word: '单词', listening: '听力', reading: '阅读', translation: '翻译', writing: '作文句式' };
const skillName: Record<string, string> = { meaning: '识义', spelling: '拼写', listening: '听力', reading: '阅读', output: '表达' };
const modules = [
  { kind: 'word', color: '#eeebff', desc: '识义与拼写分开练', unit: '词' },
  { kind: 'listening', color: '#eaf3ff', desc: '播放音频与答题解析', unit: '题组' },
  { kind: 'reading', color: '#e8f8f2', desc: '阅读文章与答题解析', unit: '篇' },
  { kind: 'translation', color: '#fff0e7', desc: '独立翻译与参考表达', unit: '条' },
  { kind: 'writing', color: '#fff7df', desc: '句式改写与作品自检', unit: '条' },
];
export function DataState({ error, retry, empty }: { error?: string; retry?: () => void; empty?: string }) {
  return <div className="feature-card" role={error ? 'alert' : 'status'}><p>{error || empty || '正在读取真实记录…'}</p>{error && retry && <button className="text-link" onClick={retry}>重新加载</button>}</div>;
}
function useSummary() {
  const [summary, setSummary] = useState<LearningSummary>();
  const [error, setError] = useState('');
  async function refresh() {
    setError('');
    try { setSummary(await getLearningSummary()); } catch (cause) { setError(cause instanceof Error ? cause.message : '记录读取失败'); }
  }
  useEffect(() => { void refresh(); }, []);
  return { summary, error, refresh };
}

export function TodayPage({ user }: { user: CurrentUser }) {
  const [plan, setPlan] = useState<TodayPlanResponse>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() { setError(''); try { setPlan(await getTodayPlan()); } catch (cause) { setError(cause instanceof Error ? cause.message : '今日计划读取失败'); } }
  useEffect(() => { void refresh(); }, []);
  const tasks = plan?.tasks ?? [];
  const completed = tasks.filter(t => t.completed >= t.target).length;
  const remaining = tasks.filter(t => t.required && t.completed < t.target);
  function openTask(key: string) {
    if (key === 'review') go('study', { filter: 'reviews' });
    else if (key === 'new_words') go('word');
    else if (key === 'game') go('games');
    else go('study');
  }
  async function continuePlan() {
    if (remaining.length) return openTask(remaining[0].key);
    setBusy(true);
    try { const result = await createCheckin(); setMessage(`${result.checkin.checkinDate} 已打卡`); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '打卡失败'); }
    finally { setBusy(false); }
  }
  return <PhoneShell active="today"><TopBar title={`你好，${user.username}`} subtitle={plan ? `${plan.server_date} · ${tierName[plan.plan_tier]}` : '今日计划'}/>
    {(!plan || error) ? <DataState error={error} retry={refresh}/> : <>
      <section className="hero"><div className="hero-kicker">今日学习积分 · {plan.earned_points}/45 分</div><h2>{remaining.length ? `今天再完成 ${remaining.length} 项，就能点亮打卡` : '今日必做任务已经完成'}</h2><p>进度来自本账号的学习记录。先复习，再学习新内容。</p><div className="hero-row"><div className="hero-progress"><div className="progress-label"><span>今日进度</span><span>{completed} / {tasks.length}</span></div><div className="track"><i style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }}/></div></div><button className="round-btn" disabled={busy} aria-label={remaining.length ? '继续学习' : '完成打卡'} onClick={continuePlan}><Icon name={remaining.length ? 'next' : 'check'}/></button></div></section>
      {message && <p role="status" className="sync-bar">{message}</p>}
      <div className="section-head"><h3>今日任务</h3><button onClick={() => go('onboarding')}>调整计划</button></div>
      <div className="task-list">{tasks.map((task, index) => <button className={`task ${task.completed >= task.target ? 'done' : ''}`} key={task.key} onClick={() => openTask(task.key)}><span className="task-icon" style={{ background: modules[index]?.color }}><Icon name={{ review: 'review', new_words: 'word', input: 'listening', output: 'writing', game: 'games' }[task.key] ?? 'study'}/></span><span className="task-copy"><strong>{task.title}</strong><small>{task.key === 'review' && task.target === 0 ? '今日暂无到期复习，无需完成' : task.key === 'new_words' ? '按不同新词计数' : task.required ? '今日计划目标' : '可选巩固任务'}</small></span><span className="task-meta">{task.completed}/{task.target}</span><span className="check">{task.completed >= task.target && <Icon name="check"/>}</span></button>)}</div>
    </>}
  </PhoneShell>;
}

function RecordCard({ item, filter, onCorrected }: { item: LearningItem; filter: string; onCorrected: () => void }) {
  const [selected, setSelected] = useState<number>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function correct() {
    if (selected === undefined) return;
    setBusy(true);
    try { await correctAttempt(item.id, selected); onCorrected(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '订正失败'); }
    finally { setBusy(false); }
  }
  function open() {
    const route = item.kind as Route;
    go(route, { content: item.contentId, ...(filter === 'reviews' && item.kind === 'word' ? { source: 'due_reviews' } : {}), ...(item.skill ? { skill: item.skill } : {}) });
  }
  return <article className="feature-card learning-record"><span className="pill">{kindName[item.kind] ?? '历史收藏'}{item.skill ? ` · ${skillName[item.skill] ?? item.skill}` : ''}</span><h3>{item.title}</h3><p>{new Date(item.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 北京时间</p>{item.note && <p>{item.note}</p>}
    {!item.available ? <p>内容已下架或暂不可用，保留你的历史记录。</p> : filter === 'mistakes' && item.question ? <><p>{item.question.prompt}</p><div className="options">{item.question.options.map((option, index) => <button className={`option ${selected === index ? 'selected' : ''}`} key={index} onClick={() => setSelected(index)}><span>{'ABCDEF'[index]}</span>{option}</button>)}</div><button className="secondary" disabled={selected === undefined || busy} onClick={correct}>提交订正</button></> : <button className="secondary" onClick={open}>{filter === 'reviews' ? '开始复习' : '打开内容'}</button>}
    {message && <p role="alert">{message}</p>}
  </article>;
}

export function StudyPage() {
  const { summary, error, refresh } = useSummary();
  const initialFilter = routeParams().get('filter') ?? 'all';
  const [filter, setFilter] = useState(['reviews', 'collections', 'mistakes'].includes(initialFilter) ? initialFilter : 'all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<LearningList>();
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (filter === 'all') return;
    let active = true;
    setList(undefined); setListError('');
    getLearningItems(filter, page).then(data => { if (active) setList(data); }).catch(cause => { if (active) setListError(cause instanceof Error ? cause.message : '列表读取失败'); });
    return () => { active = false; };
  }, [filter, page, revision]);
  const tabs = [['all', '全部'], ['reviews', '待复习'], ['collections', '收藏'], ['mistakes', '错题']] as const;
  return <PhoneShell active="study"><TopBar title="学习中心" subtitle="已发布内容 · 我的学习记录"/>
    <div className="chips" aria-label="学习筛选">{tabs.map(([key, label]) => <button className={`chip ${filter === key ? 'active' : ''}`} aria-pressed={filter === key} key={key} onClick={() => { setFilter(key); setPage(1); }}>
      {label}{key !== 'all' ? ` ${summary && !error ? summary[key] : '—'}` : ''}</button>)}</div>
    {error && <DataState error={error} retry={refresh}/>}
    {filter === 'all' ? <><div className="section-head"><h3>选择学习内容</h3><span className="pill">可用题库</span></div>{!summary ? !error && <DataState/> : <div className="module-grid">{modules.map((m, i) => <button className={`module-card ${i === 4 ? 'wide' : ''}`} key={m.kind} disabled={!summary.modules[m.kind]} onClick={() => go(m.kind as Route)}><span className="module-icon" style={{ background: m.color }}><Icon name={m.kind}/></span><span><h3>{kindName[m.kind]}</h3><p>{m.desc}</p></span><b className="count">{summary.modules[m.kind] ? `${summary.modules[m.kind]} ${m.unit}` : '暂无内容'}</b></button>)}</div>}</> : <>
      {filter === 'mistakes' && <p className="list-note">普通学习练习的首次错答，订正后移出此列表；不会覆盖首次成绩。挑战成绩不在此提前揭晓。</p>}
      {!list ? <DataState error={listError} retry={() => setRevision(v => v + 1)}/> : !list.items.length ? <DataState empty={filter === 'reviews' ? '当前没有到期复习。完成学习后，复习会按间隔自动安排。' : filter === 'collections' ? '还没有收藏。在学习内容中点击收藏，就能在这里找回。' : '当前没有待订正的学习错题。'}/> : list.items.map(item => <RecordCard key={item.id} item={item} filter={filter} onCorrected={() => { setRevision(v => v + 1); void refresh(); }}/>) }
      {list && list.pagination.pages > 1 && <div className="pagination"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page} / {list.pagination.pages}</span><button disabled={page >= list.pagination.pages} onClick={() => setPage(p => p + 1)}>下一页</button></div>}
    </>}
  </PhoneShell>;
}

export function MePage({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const { summary, error, refresh } = useSummary();
  return <PhoneShell active="me"><TopBar title="我的" subtitle="个人记录默认私有"/><div className="profile-card"><div className="avatar">{user.username[0]?.toUpperCase()}</div><div><h2>{user.username}</h2><p>{summary ? tierName[summary.planTier] : '正在读取计划…'}{!user.email.endsWith('.invalid') && ` · ${user.email}`}</p></div></div>
    <div className="section-head"><h3>学习记录</h3></div>{!summary || error ? <DataState error={error} retry={refresh}/> : <><div className="metric-row"><div className="metric"><strong>{summary.practicedWords}</strong><small>已练词汇</small></div><button className="metric" onClick={() => go('study', { filter: 'collections' })}><strong>{summary.collections}</strong><small>收藏内容</small></button><button className="metric" onClick={() => go('study', { filter: 'mistakes' })}><strong>{summary.mistakes}</strong><small>待订正</small></button></div><p className="list-note">已练词汇按识义、拼写练习中的不同单词去重，不等同于已掌握。待订正统计普通学习练习。</p></>}
    <div className="section-head"><h3>设置与资料</h3></div><div className="menu-list">
      <button className="menu-item" onClick={() => go('upload')}><Icon name="upload"/><span>我的资料与上传</span><Icon name="next"/></button>
      <button className="menu-item" onClick={() => go('onboarding')}><Icon name="today"/><span>每日计划与考试目标</span><small>{summary ? tierName[summary.planTier] : '—'}</small><Icon name="next"/></button>
      {user.role !== 'learner' && <button className="menu-item" onClick={() => go('admin')}><Icon name="study"/><span>内容管理后台</span><Icon name="next"/></button>}
      <button className="menu-item" onClick={onLogout}><Icon name="logout"/><span>退出登录</span><Icon name="next"/></button>
    </div></PhoneShell>;
}

export function TeamPage({ user }: { user: CurrentUser }) {
  const { team: overview, teamError, refreshTeam } = useDashboard();
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshTeam(); }, []);
  async function submit(create: boolean) {
    setBusy(true); setMessage('');
    try { if (create) await createTeam(name.trim()); else await joinTeam(invite.trim()); await refreshTeam(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  }
  if (teamError || overview === undefined) return <PhoneShell active="team"><TopBar title="小队"/><DataState error={teamError} retry={refreshTeam}/></PhoneShell>;
  if (!overview) return <PhoneShell active="team"><TopBar title="小队" subtitle="加入后，这里就是你们的周榜"/><div className="feature-card"><h3>一起学习，互相鼓励</h3><p>小队只展示学习积分，不公开私人错题和作品。</p></div><label className="field-label">小队名称</label><input className="form-input" placeholder="为小队起个名字" value={name} onChange={e => setName(e.target.value)}/><button className="primary" disabled={busy || !name.trim()} onClick={() => submit(true)}>创建小队</button><label className="field-label">邀请码</label><input className="form-input" placeholder="输入 8 位邀请码" value={invite} onChange={e => setInvite(e.target.value.toUpperCase())}/><button className="secondary" disabled={busy || !invite.trim()} onClick={() => submit(false)}>加入小队</button>{message && <p role="alert">{message}</p>}</PhoneShell>;
  const members = [...overview.members].sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  return <PhoneShell active="team"><TopBar title="周榜" subtitle={`${overview.team.name} · 北京时间本周一 00:00 起`}/><section className="hero"><div className="hero-kicker">本周小队学习积分</div><h2>{members.reduce((sum, m) => sum + m.points, 0)} 分</h2><p>{members.length} 位成员 · 同分并列，不代表六级考试成绩。</p></section><div className="section-head"><h3>本周排名</h3><button onClick={refreshTeam}>刷新</button></div><div className="leader-list">{members.map(person => <div className="leader" key={person.userId}><span className="rank">{members.findIndex(m => m.points === person.points) + 1}</span><i className="mini-avatar" style={{ margin: 0, border: 0, background: '#eeebff' }}>{person.nickname[0]}</i><span><strong>{person.nickname}{person.userId === user.id && '（我）'}</strong><small>{person.role === 'owner' ? '队长' : '成员'}</small></span><span className="score">{person.points} 分</span>{person.userId !== user.id && <button className="text-link" onClick={() => void sendTeamReaction(overview.team.id, person.userId).then(() => setMessage(`已鼓励 ${person.nickname}`)).catch(cause => setMessage(cause instanceof Error ? cause.message : '鼓励失败'))}>鼓励</button>}</div>)}</div>
    <details className="feature-card"><summary>小队信息与邀请</summary><p>邀请码：{overview.team.inviteCode}</p><p>有效期至 {new Date(overview.team.inviteExpiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</p></details>{message && <p role="status" className="sync-bar">{message}</p>}<button className="primary" onClick={() => go('challenge')}>查看异步挑战</button></PhoneShell>;
}
