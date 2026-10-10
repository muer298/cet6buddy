import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMyTeam, type TeamOverview } from '../api';
import type { CurrentUser, Route } from '../types';
import { go } from '../navigation';

const paths: Record<string, ReactNode> = {
  today: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
  study: <><path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/></>,
  games: <path d="m12 2 10 10-10 10L2 12Z"/>,
  team: <><circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 4v3"/></>,
  me: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>,
  word: <><path d="m3 20 6-16 6 16M5 15h8M17 9h4v11M17 15h4"/></>,
  listening: <><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></>,
  reading: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h5"/></>,
  translation: <><path d="M2 5h12M8 2v3M11 5c-1 6-4 9-9 12M4 8c2 4 4 6 8 8m1 5 4-12 5 12m-8-4h7"/></>,
  writing: <><path d="m4 16 12-12 4 4L8 20l-5 1 1-5ZM13 7l4 4"/></>,
  review: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/></>,
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>,
  pause: <path d="M8 5v14M16 5v14"/>,
  back: <path d="m15 5-7 7 7 7"/>,
  next: <path d="m9 5 7 7-7 7"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,
  logout: <><path d="M9 4H3v16h6M8 12h13m-5-5 5 5-5 5"/></>,
};
export function Icon({ name }: { name: string }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] ?? paths.study}</svg>;
}

const DashboardContext = createContext<{ user: CurrentUser | null; team: TeamOverview | null | undefined; teamError: string; refreshTeam: () => Promise<void> }>({ user: null, team: undefined, teamError: '', refreshTeam: async () => {} });
export const useDashboard = () => useContext(DashboardContext);
export function DashboardProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [team, setTeam] = useState<TeamOverview | null>();
  const [teamError, setTeamError] = useState('');
  async function refreshTeam() {
    setTeamError('');
    try { setTeam((await getMyTeam()).overview ?? null); }
    catch (cause) { setTeamError(cause instanceof Error ? cause.message : '小队状态读取失败'); }
  }
  useEffect(() => { void refreshTeam(); }, [user.id]);
  return <DashboardContext.Provider value={{ user, team, teamError, refreshTeam }}>{children}</DashboardContext.Provider>;
}
export function TopBar({ title, subtitle }: { title: string; subtitle?: string; action?: string }) {
  return <header className="topbar"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h1>{title}</h1></div></header>;
}
export function DetailTop({ title, right }: { title: string; right?: string }) {
  return <header className="topbar"><button className="back" onClick={() => history.back()} aria-label="返回"><Icon name="back"/></button><h2>{title}</h2>{right ? <span className="pill">{right}</span> : <span className="detail-spacer"/>}</header>;
}
export function PhoneShell({ children, active, noNav = false }: { children: ReactNode; active?: Route; noNav?: boolean }) {
  const { team } = useDashboard();
  const items: Array<[Route, string]> = [['today', '今日'], ['study', '学习'], ['games', '闯关'], ['team', team ? '周榜' : '小队'], ['me', '我的']];
  return <main className="phone-shell"><section className={`page ${noNav ? 'no-nav' : ''}`}>{children}</section>{!noNav && active && <nav className="bottom-nav" aria-label="主导航">{items.map(([route, label]) => <button key={route} aria-current={active === route ? 'page' : undefined} className={`nav-item ${active === route ? 'active' : ''}`} onClick={() => go(route)}><Icon name={route}/><span>{label}</span></button>)}</nav>}</main>;
}
