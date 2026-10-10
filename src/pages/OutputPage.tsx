import { useEffect, useState } from 'react';
import { addCollection, getOutputContent, saveOpenSubmission, type OutputContent } from '../api';
import { DetailTop, PhoneShell, useDashboard } from '../components/AppShell';
import { routeParams } from '../navigation';
import { DataState } from './DashboardPages';

export function OutputPage({ kind }: { kind: 'translation' | 'writing' }) {
  const { user } = useDashboard();
  const [items, setItems] = useState<OutputContent[]>();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  async function load() { setError(''); try { setItems((await getOutputContent(kind, routeParams().get('content') ?? '')).items); } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败'); } }
  useEffect(() => { void load(); }, [kind]);
  const item = items?.[index];
  return <PhoneShell active="study"><DetailTop title={kind === 'translation' ? '翻译积累' : '作文句式'}/>{error || !items ? <DataState error={error} retry={load}/> : !item ? <DataState empty="当前没有可用的已发布内容。"/> : <><OutputExercise key={`${item.id}:${item.version}`} item={item} kind={kind} userId={user!.id}/>{items.length > 1 && <div className="pagination"><button disabled={!index} onClick={() => setIndex(i => i - 1)}>上一条</button><span>{index + 1}/{items.length}</span><button disabled={index === items.length - 1} onClick={() => setIndex(i => i + 1)}>下一条</button></div>}</>}</PhoneShell>;
}
function OutputExercise({ item, kind, userId }: { item: OutputContent; kind: 'translation' | 'writing'; userId: string }) {
  const draftKey = `cet6:${userId}:draft:${item.id}:${item.version}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [checks, setChecks] = useState({ complete: false, natural: false, appropriate: false });
  const [showReferences, setShowReferences] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    try { await saveOpenSubmission(kind, item.id, text, checks); setSaved(true); localStorage.removeItem(draftKey); setMessage('作品与自检已保存；开放表达不自动打分。'); }
    catch (cause) { setMessage(`${cause instanceof Error ? cause.message : '保存失败'}，草稿仍保存在本机。`); }
    finally { setBusy(false); }
  }
  return <><div className="feature-card"><span className="pill">已发布内容 · 版本 {item.version}</span><h3 style={{ marginTop: 16 }}>{item.prompt}</h3><p>来源：{item.source}</p></div><label className="field-label">你的表达</label><textarea className="form-input output-area" value={text} disabled={saved} onChange={e => { setText(e.target.value); localStorage.setItem(draftKey, e.target.value); }} placeholder="先独立回忆，再对照参考表达。"/><div className="check-list">{([['complete', '意义完整'], ['natural', '搭配自然'], ['appropriate', '语境合适']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={checks[key]} disabled={saved} onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}/>{label}</label>)}</div><button className="primary" disabled={!text.trim() || busy || saved} onClick={save}>{saved ? '已保存' : '保存作品与自检'}</button><button className="secondary" style={{ marginTop: 12 }} onClick={() => setShowReferences(v => !v)}>{showReferences ? '隐藏参考表达' : '对照参考表达'}</button>{showReferences && <div className="hint-box">{item.references.map((ref, i) => <p key={i}>{ref}</p>)}</div>}<button className="text-link" style={{ display: 'block', margin: '20px auto' }} onClick={() => void addCollection(item.id, item.version, kind).then(() => setMessage('已加入个人收藏。')).catch(cause => setMessage(cause instanceof Error ? cause.message : '收藏失败'))}>收藏本条内容</button>{message && <p className="sync-bar" role="status">{message}</p>}</>;
}
