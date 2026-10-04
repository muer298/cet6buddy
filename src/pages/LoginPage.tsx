import { useState } from 'react';
import { requestLoginCode, verifyLoginCode } from '../api';
import type { CurrentUser } from '../types';

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('登录后可跨设备保存学习记录。');

  async function sendCode() {
    setBusy(true);
    try {
      const result = await requestLoginCode(email);
      setSent(true);
      if (result.debug_code) setCode(result.debug_code);
      setMessage(result.debug_code ? '本地开发验证码已自动填入。' : '验证码已发送，请检查邮箱。');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '验证码发送失败。'); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true);
    try { onAuthenticated((await verifyLoginCode(email, code)).user); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '登录失败。'); }
    finally { setBusy(false); }
  }

  return <main className="phone-shell"><section className="page no-nav"><div className="statusbar"><span>09:41</span><div className="status-icons"><span>5G</span><span>▮▮▮</span><i className="status-dot" /></div></div><div className="login-mark">B</div><p className="eyebrow" style={{ textAlign: 'center' }}>CET6 Buddy</p><h1 style={{ textAlign: 'center', marginBottom: 8 }}>继续你的六级计划</h1><p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 28 }}>{message}</p><label className="field-label">邮箱</label><input className="form-input" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />{sent && <><label className="field-label">6 位验证码</label><input className="form-input" inputMode="numeric" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoComplete="one-time-code" /></>}<button className="primary" disabled={busy || !email || (sent && code.length !== 6)} onClick={sent ? verify : sendCode}>{busy ? '请稍候…' : sent ? '验证并登录' : '获取验证码'}</button>{sent && <button className="text-link" style={{ display: 'block', margin: '16px auto' }} onClick={sendCode} disabled={busy}>重新发送</button>}</section></main>;
}
