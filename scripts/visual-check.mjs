import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const output = new URL('../screenshots/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
});
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() < 400) return;
  if (response.status() === 401 && response.url().endsWith('/api/me')) return;
  errors.push(`${response.status()} ${response.url()}`);
});

await page.goto('http://127.0.0.1:4173/#login', { waitUntil: 'networkidle' });
await page.getByPlaceholder('用户名或 name@example.com').fill(process.env.E2E_IDENTIFIER ?? 'visual-admin');
await page.getByPlaceholder('请输入密码').fill(process.env.E2E_PASSWORD ?? 'Visual-pass-2026');
await page.getByRole('button', { name: '登录' }).click();
await page.waitForURL(/#today$/);

const allRoutes = [
  'today', 'study', 'games', 'team', 'me', 'word', 'listening', 'reading',
  'translation', 'writing', 'rootgame', 'flashgame', 'streakgame', 'challenge',
  'upload', 'login', 'onboarding', 'result',
];

for (const route of allRoutes) {
  await page.goto(`http://127.0.0.1:4173/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) errors.push(`${route}: horizontal overflow`);
  if (!(await page.locator('.phone-shell').count())) errors.push(`${route}: phone shell missing`);
}

await page.goto('http://127.0.0.1:4173/#upload', { waitUntil: 'networkidle' });
await page.locator('input[type="file"]').setInputFiles({ name: 'visual.png', mimeType: 'image/png', buffer: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]) });
await page.getByText('上传完成，已进入人工整理队列。').waitFor();

await page.goto('http://127.0.0.1:4173/#listening', { waitUntil: 'networkidle' });
await page.locator('.option').nth(1).click();
await page.getByRole('button', { name: '提交听力答案' }).click();
await page.locator('.answer-feedback').waitFor();

await page.goto('http://127.0.0.1:4173/#reading', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '题目' }).click();
await page.locator('.option').nth(1).click();
await page.getByRole('button', { name: '提交阅读答案' }).click();
await page.getByText('解析：').waitFor();

await page.goto('http://127.0.0.1:4173/#translation', { waitUntil: 'networkidle' });
await page.locator('textarea').fill('Cultural heritage strengthens a shared sense of identity.');
await page.getByRole('button', { name: '保存作品与自检' }).click();
await page.getByText(/作品已保存/).waitFor();

await page.goto('http://127.0.0.1:4173/#word', { waitUntil: 'networkidle' });
for (const correctIndex of [1, 0, 1, 1, 1]) {
  await page.locator('.option').nth(correctIndex).click();
  const submit = page.getByRole('button', { name: '确认答案' });
  if (await submit.isDisabled()) errors.push('word: submit did not enable');
  await submit.click();
  await page.locator('.answer-feedback').waitFor();
  await page.locator('.primary').click();
}
await page.waitForTimeout(300);
if (!page.url().endsWith('#result')) errors.push('word: result navigation failed');

for (const route of ['today', 'study', 'games', 'word', 'team', 'me', 'login']) {
  await page.goto(`http://127.0.0.1:4173/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: fileURLToPath(new URL(`${route}.png`, output)), fullPage: false });
}

await page.setViewportSize({ width: 1365, height: 900 });
await page.goto('http://127.0.0.1:4173/#admin', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: fileURLToPath(new URL('admin.png', output)), fullPage: true });

console.log(JSON.stringify({ routesChecked: allRoutes.length + 1, learningFlowsChecked: ['word', 'listening', 'reading', 'translation'], uploadChecked: true, screenshots: 8, errors }, null, 2));
await browser.close();
