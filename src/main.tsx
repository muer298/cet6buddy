import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useRegisterSW } from 'virtual:pwa-register/react';
import App from './App';
import '../styles.css';

function PwaUpdate() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <div className="pwa-update" role="status"><span>发现新版本，更新不会丢失当前输入。</span><button onClick={() => updateServiceWorker(true)}>立即更新</button><button onClick={() => setNeedRefresh(false)}>稍后</button></div>;
}

createRoot(document.getElementById('app')!).render(
  <StrictMode><App /><PwaUpdate /></StrictMode>,
);
