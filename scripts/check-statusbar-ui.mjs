import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Layout regression only: authenticated pages use isolated API fixtures, not production user data.
const origin = process.env.UI_ORIGIN ?? 'http://127.0.0.1:4186';
const output = new URL('../screenshots/no-statusbar/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let authenticated = false;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = { error: { code: 'LAYOUT_FIXTURE', message: '布局回归测试' } }, status = 409;
    if (path === '/api/me') {
      body = authenticated ? { user: { id: 'layout-user', username: 'layout-user', nickname: '布局测试', role: 'admin', mustChangePassword: false, planTier: 'standard', timezone: 'Asia/Shanghai' } } : { error: { code: 'UNAUTHORIZED', message: '请登录' } };
      status = authenticated ? 200 : 401;
    } else if (path === '/api/teams/me') { body = { overview: null }; status = 200; }
    else if (path === '/api/challenges') { body = { challenges: [] }; status = 200; }
    else if (path === '/api/admin/content') { body = { content: [], pagination: { pages: 1, page: 1, total: 0 } }; status = 200; }
    else if (path === '/api/admin/users') { body = { users: [] }; status = 200; }
    else if (path === '/api/imports') { body = { imports: [] }; status = 200; }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const routes = ['login', 'today', 'study', 'games', 'team', 'me', 'word', 'listening', 'reading', 'translation', 'writing', 'rootgame', 'flashgame', 'streakgame', 'challenge', 'upload', 'onboarding', 'result', 'admin'];
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      authenticated = route !== 'login';
      await page.goto(`${origin}/#${route}`, { waitUntil: 'networkidle' });
      if (route === 'login') await page.getByPlaceholder('请输入密码').waitFor();
      else await page.getByText('正在恢复登录状态', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.statusbar, .status-icons, .status-dot').count(), 0, `${route}: fake status bar`);
      assert.equal((await page.locator('body').innerText()).includes('09:41'), false, `${route}: fake clock`);
      if (route !== 'admin') assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}: overflow ${width}`);
      if (width === 390 && ['login', 'today', 'reading'].includes(route)) await page.screenshot({ path: fileURLToPath(new URL(`${route}-390.png`, output)) });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 19 routes x 3 mobile widths, no simulated status bar or clock, mobile pages have no horizontal overflow. Authenticated layout uses fixtures.');
} finally { await browser.close(); }
