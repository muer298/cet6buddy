import { useState } from 'react';
import { changePassword, passwordLogin } from '../api';
import type { CurrentUser } from '../types';

interface LoginPageProps {
  pendingUser?: CurrentUser;
  onAuthenticated: (user: CurrentUser) => void;
}

export function LoginPage({ pendingUser, onAuthenticated }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [forcedUser, setForcedUser] = useState<CurrentUser | undefined>(pendingUser);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(pendingUser ? '首次登录需要先修改初始密码。' : '使用管理员发放的账号登录。');

  async function login() {
    setBusy(true);
    try {
      const result = await passwordLogin(identifier, currentPassword);
      if (result.user.mustChangePassword) {
        setForcedUser(result.user);
        setMessage('首次登录需要先修改初始密码。');
      } else {
        onAuthenticated(result.user);
      }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '登录失败。'); }
    finally { setBusy(false); }
  }

  async function updatePassword() {
    if (newPassword !== confirmation) {
      setMessage('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      onAuthenticated(result.user);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '密码修改失败。'); }
    finally { setBusy(false); }
  }

  const changing = Boolean(forcedUser);
  return <main className="phone-shell"><section className="page no-nav"><div className="statusbar"><span>09:41</span><div className="status-icons"><span>5G</span><span>▮▮▮</span><i className="status-dot" /></div></div><div className="login-mark">B</div><p className="eyebrow" style={{ textAlign: 'center' }}>CET6 Buddy</p><h1 style={{ textAlign: 'center', marginBottom: 8 }}>{changing ? '设置你的新密码' : '继续你的六级计划'}</h1><p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 28 }}>{message}</p>{!changing && <><label className="field-label">用户名或邮箱</label><input className="form-input" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="用户名或 name@example.com" autoComplete="username" /></>}<label className="field-label">{changing ? '当前初始密码' : '密码'}</label><input className="form-input" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="请输入密码" autoComplete={changing ? 'current-password' : 'current-password'} />{changing && <><label className="field-label">新密码</label><input className="form-input" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="至少 10 位，包含字母和数字" autoComplete="new-password" /><label className="field-label">确认新密码</label><input className="form-input" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="再次输入新密码" autoComplete="new-password" /></>}<button className="primary" disabled={busy || (!changing && !identifier) || !currentPassword || (changing && (!newPassword || !confirmation))} onClick={changing ? updatePassword : login}>{busy ? '请稍候…' : changing ? '保存新密码并进入' : '登录'}</button>{!changing && <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 18, fontSize: 13 }}>忘记密码请联系管理员重置。</p>}</section></main>;
}
