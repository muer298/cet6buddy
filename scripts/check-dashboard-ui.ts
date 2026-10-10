import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createApp } from '../server/app.ts';
import { InMemoryStore } from '../server/store.ts';
import { hashPassword } from '../server/auth.ts';
import { legacyContent } from '../server/legacy-content.ts';
import { freezeQuestions, questionsFromContent } from '../server/question-bank.ts';

// Real API handlers + isolated in-memory records. Never reads or writes production accounts.
const origin = process.env.UI_ORIGIN ?? 'http://127.0.0.1:4186';
const store = new InMemoryStore();
const password = 'Isolated-layout-test-2026';
for (const item of legacyContent) store.content.set(item.id, [{ ...item, visibility: 'public', status: 'published', createdAt: new Date().toISOString() }]);
const users = await Promise.all(['layout-a', 'layout-b'].map(username => hashPassword(password).then(passwordHash => store.createPasswordUser({ username, email: `${username}@test.invalid`, nickname: '测试昵称', role: 'learner', passwordHash, mustChangePassword: false }))));
const word = store.content.get(legacyContent[0].id)![0];
const questions = questionsFromContent(word);
const session = await store.createSession({ userId: users[0].id, source: 'new_words', mode: 'practice', ...freezeQuestions(questions) });
await store.saveAttempt({ userId: users[0].id, sessionId: session.id, questionId: questions[0].id, questionVersion: questions[0].version, answerIndex: (questions[0].correctIndex + 1) % 4, correct: false, idempotencyKey: 'layout-mistake' });
await store.addCollection({ userId: users[0].id, contentItemId: word.id, contentVersion: word.version, kind: 'word' });
await store.updateReviewState(users[0].id, word.id, 'meaning', false, '2020-01-01T00:00:00Z');
await store.awardPoints(users[0].id, 'layout-points', 3, 'UI test');
const output = await store.createContent({ kind: 'writing', visibility: 'public', payload: { prompt: 'Write a sentence about learning.', references: ['Learning a little every day helps.'], source: 'Isolated UI fixture' } });
await store.updateContentStatus(output.id, 1, 'published', users[0].id);
const app = createApp(store, { authOptions: { secureCookie: false }, corsOrigin: origin });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors: string[] = [];
await mkdir('screenshots/dashboard', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/api/**', async route => {
    const req = route.request();
    const response = await app.handle(new Request(req.url(), { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function navigate(route: string, heading: string) {
    await page.goto(`${origin}/#${route}`);
    await page.locator('.topbar').getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    await page.locator('.page').evaluateAll(elements => elements.forEach(el => el.getAnimations().forEach(animation => animation.finish())));
  }
  async function login(username: string) {
    await page.goto(`${origin}/#login`);
    await page.getByPlaceholder('用户名或 name@example.com').fill(username);
    await page.getByPlaceholder('请输入密码').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('heading', { name: `你好，${username}`, exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
  }
  await login('layout-a');
  assert.ok((await page.locator('.hero').innerText()).includes('3/45'));
  assert.equal(await page.getByText('小队在学').count(), 0);
  await navigate('me', '我的');
  assert.deepEqual(await page.locator('.metric strong').allTextContents(), ['1', '1', '1']);
  await page.getByRole('button', { name: '1 收藏内容' }).click();
  await page.getByRole('heading', { name: word.payload.word as string }).waitFor();
  await page.getByRole('button', { name: '待复习 1', exact: true }).click();
  await page.getByRole('button', { name: '开始复习' }).click();
  await page.getByRole('heading', { name: '到期复习', exact: true }).waitFor();
  await page.locator('.word').getByText(word.payload.word as string, { exact: true }).waitFor();
  await navigate('study', '学习中心');
  await page.getByRole('button', { name: '错题 1', exact: true }).click();
  await page.locator('.learning-record .option').nth(questions[0].correctIndex).click();
  await page.getByRole('button', { name: '提交订正' }).click();
  await page.getByRole('button', { name: '错题 0', exact: true }).waitFor();
  await page.getByText('当前没有待订正的学习错题。', { exact: true }).waitFor();
  await navigate('team', '小队');
  await page.getByPlaceholder('为小队起个名字').fill('布局验收小队');
  await page.getByRole('button', { name: '创建小队', exact: true }).click();
  await page.getByRole('heading', { name: '周榜', exact: true }).waitFor();
  await page.getByRole('navigation').getByRole('button', { name: '周榜', exact: true }).waitFor();
  const invite = [...store.teams.values()][0].inviteCode;
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route, heading] of [['today', '你好，layout-a'], ['study', '学习中心'], ['games', '闯关'], ['team', '周榜'], ['me', '我的'], ['writing', '作文句式'], ['reading', '仔细阅读'], ['listening', '听力练习']]) {
      await navigate(route, heading);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}`);
      const geometry = await page.locator('.nav-item > svg, .play > svg, .module-icon > svg, .task-icon > svg').evaluateAll(icons => icons.map(icon => {
        const a = icon.getBoundingClientRect(), b = icon.parentElement!.getBoundingClientRect();
        return { x: Math.abs(a.x + a.width / 2 - b.x - b.width / 2), y: Math.abs(a.y + a.height / 2 - b.y - b.height / 2), nav: icon.parentElement!.classList.contains('nav-item') };
      }));
      assert.ok(geometry.every(g => g.x < 1 && (g.nav || g.y < 1)), `${route}: centered SVG frames`);
      if (width === 390 && ['today', 'study', 'games', 'team', 'me'].includes(route)) await page.screenshot({ path: `screenshots/dashboard/${route}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  await navigate('me', '我的');
  await page.getByRole('button', { name: '退出登录' }).click();
  await login('layout-b');
  await navigate('me', '我的');
  assert.deepEqual(await page.locator('.metric strong').allTextContents(), ['0', '0', '0']);
  await page.getByRole('navigation').getByRole('button', { name: '小队', exact: true }).waitFor();
  await navigate('team', '小队');
  await page.getByPlaceholder('输入 8 位邀请码').fill(invite);
  await page.getByRole('button', { name: '加入小队', exact: true }).click();
  await page.getByRole('heading', { name: '周榜', exact: true }).waitFor();
  assert.equal(await page.locator('.leader').count(), 2);
  assert.deepEqual(await page.locator('.leader .score').allTextContents(), ['3 分', '0 分']);
  await store.awardPoints(users[1].id, 'layout-tie', 3, 'UI tie test');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.leader .score')].every(el => el.textContent === '3 分'));
  assert.deepEqual(await page.locator('.leader .rank').allTextContents(), ['1', '1']);
  // API failure must not be rendered as zeroes, fake history or successful completion.
  await context.route('**/api/me/learning-summary', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试断网，请重试' } }) }));
  await navigate('me', '我的');
  await page.getByRole('alert').getByText('测试断网，请重试', { exact: true }).waitFor();
  assert.equal(await page.locator('.metric').count(), 0);
  await context.route('**/api/me/plan', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '计划读取失败' } }) }));
  await navigate('today', '你好，layout-b');
  await page.getByRole('alert').getByText('计划读取失败', { exact: true }).waitFor();
  assert.equal(await page.locator('.hero, .task').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: two-account isolation, real lists/correction, create/join -> leaderboard, API failure states, 8 pages at 360/390/430px, centered icons and no overflow. Chromium, not physical iOS/WeChat.');
} finally { await browser.close(); }
