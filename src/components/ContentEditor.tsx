import { useEffect, useState } from 'react';
import { createManagedContent, createManagedContentVersion, getManagedContent, setManagedContentStatus, type ManagedContent } from '../api';

const templates: Record<string, Record<string, unknown>> = {
  word: { word: 'coherent', phonetic: '/kəʊˈhɪərənt/', meaning: '连贯的', prompt: '选择正确释义', options: ['连贯的', '临时的', '稀少的', '模糊的'], correct_index: 0, explanation: 'coherent 可用于形容思路或论述连贯。', source: '请填写资料名称、作者及授权情况' },
  reading: { title: '阅读标题', passage: '请粘贴完整文章。', source: '请填写来源及授权情况', questions: [{ prompt: '请填写题干', options: ['选项 A', '选项 B', '选项 C', '选项 D'], correct_index: 0, explanation: '请填写解析及原文依据' }] },
  listening: { title: '听力标题', asset_id: '请填下方已上传音频的资源 ID', source: '请填写来源及授权情况', questions: [{ prompt: '请填写题干', options: ['选项 A', '选项 B', '选项 C', '选项 D'], correct_index: 0, explanation: '请填写解析' }] },
};

export function ContentEditor() {
  const [items, setItems] = useState<ManagedContent[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [editing, setEditing] = useState<ManagedContent | null>(null);
  const [kind, setKind] = useState('word');
  const [visibility, setVisibility] = useState('private');
  const [payload, setPayload] = useState(JSON.stringify(templates.word, null, 2));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { const result = await getManagedContent(page); setItems(result.content); setPages(result.pagination.pages); };
  useEffect(() => { void refresh().catch(error => setMessage(error.message)); }, [page]);
  async function save() {
    setBusy(true);
    try {
      const value = JSON.parse(payload);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请填写一个 JSON 对象。');
      const result = editing ? await createManagedContentVersion(editing.id, value) : await createManagedContent(kind, value, visibility);
      setEditing(result.content);
      setMessage(result.validation_errors.length ? `草稿已保存，发布前需补齐：${result.validation_errors.join('；')}` : '草稿已保存。请核对答案、来源和可见范围，再点击发布。');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  async function status(item: ManagedContent, action: 'publish' | 'withdraw') {
    if (!window.confirm(action === 'publish' ? `确认将 v${item.version} 发布为${item.visibility === 'public' ? '全体用户可练习' : '仅所有者可练习'}的题目？请确认来源授权和答案。` : '确认下架此内容的所有已发布版本？历史练习仍保留原版本。')) return;
    setBusy(true);
    try { await setManagedContentStatus(item.id, action); setMessage(action === 'publish' ? '已发布，新的学习会话将使用此版本。' : '已下架，不再用于新会话。'); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }
  return <section className="feature-card">
    <h3>真实题库 · 录入与版本管理</h3>
    <p>附件上传后不会自动切题。可在此粘贴结构化题目，保存草稿、核对后发布；已发布内容的修改会创建新版本。</p>
    <label className="field-label">内容类型 / 新建时的可见范围</label>
    <div className="admin-user-form"><select aria-label="内容类型" className="form-input" disabled={!!editing} value={kind} onChange={e => { setKind(e.target.value); setPayload(JSON.stringify(templates[e.target.value], null, 2)); }}><option value="word">单词选择题</option><option value="reading">阅读题组</option><option value="listening">听力题组</option></select><select aria-label="可见范围" className="form-input" disabled={!!editing} value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">私有 · 仅所有者</option><option value="public">全体用户 · 需有公开授权</option></select></div>
    <label className="field-label" htmlFor="content-json">{editing ? `编辑 ${editing.id}（将创建新版本）` : '新题内容 JSON · correct_index 从 0 开始'}</label>
    <textarea id="content-json" className="form-input" style={{ minHeight: 330, fontFamily: 'monospace' }} value={payload} onChange={e => setPayload(e.target.value)} />
    <div className="chips"><button className="primary" disabled={busy} onClick={save}>保存为草稿</button><button className="secondary" disabled={busy} onClick={() => { setEditing(null); setPayload(JSON.stringify(templates[kind] ?? templates.word, null, 2)); setMessage(''); }}>新建另一条</button></div>
    {message && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}
    {items.map(item => <div key={item.id} className="feature-card"><strong>{String(item.payload.word ?? item.payload.title ?? item.payload.prompt ?? item.kind)}</strong><p>v{item.version} · {item.status} · {item.visibility} · {String(item.payload.source ?? '来源待补充')}</p><small style={{ overflowWrap: 'anywhere' }}>ID: {item.id}</small><div className="chips"><button className="secondary" disabled={busy} onClick={() => { setEditing(item); setKind(item.kind); setVisibility(item.visibility); setPayload(JSON.stringify(item.payload, null, 2)); setMessage('已载入内容；保存后会生成新草稿，不会覆盖旧版。'); }}>编辑新版本</button><button className="secondary" disabled={busy || item.status === 'published'} onClick={() => status(item, 'publish')}>发布</button><button className="text-link" disabled={busy} onClick={() => status(item, 'withdraw')}>下架</button></div></div>)}
    <div className="chips"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {pages}</span><button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>
  </section>;
}
