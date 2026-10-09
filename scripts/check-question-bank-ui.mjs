import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const credentialPath = process.env.BANK_BROWSER_CREDENTIAL_FILE;
if (!credentialPath) throw new Error('Private test credential file required');
const credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
const origin = process.env.BANK_ORIGIN ?? 'https://101.33.35.107';
const output = new URL('../screenshots/question-bank/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/#login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('用户名或 name@example.com').fill(credentials.identifier);
  await page.getByPlaceholder('请输入密码').fill(credentials.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/#today$/);
  await page.goto(`${origin}/#admin`, { waitUntil: 'networkidle' });
  await page.getByText('真实题库 · 录入与版本管理').waitFor();
  const payload = { word: 'browser-draft-only', meaning: '浏览器录入测试', prompt: 'UI 测试题', options: ['一', '二'], correct_index: 0, explanation: '私有草稿，不发布', source: '自动化浏览器验证' };
  await page.getByLabel('新题内容 JSON · correct_index 从 0 开始').fill(JSON.stringify(payload, null, 2));
  await page.getByRole('button', { name: '保存为草稿', exact: true }).click();
  await page.getByRole('status').getByText(/草稿已保存/).waitFor();
  await page.getByText('browser-draft-only', { exact: true }).waitFor();
  await page.locator('#content-editor').screenshot({ path: fileURLToPath(new URL('admin-editor.png', output)) });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['word', 'reading', 'listening']) {
      await page.goto(`${origin}/#${route}`, { waitUntil: 'networkidle' });
      if (route === 'word') await page.locator('.word').waitFor();
      else await page.getByText('CET6 Buddy 内置试用示例（非官方真题）', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${route} width ${width}`);
      if (route === 'reading') {
        assert.ok((await page.locator('.passage').innerText()).includes('Small habits reduce'));
        await page.getByRole('button', { name: '题目', exact: true }).click();
        await page.locator('.option').nth(1).click();
        await page.getByRole('button', { name: '提交阅读答案', exact: true }).click();
        await page.getByText(/文章证据说明/).waitFor();
      }
      if (width === 390) await page.screenshot({ path: fileURLToPath(new URL(`${route}-390.png`, output)) });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: admin draft entry, database-backed word/listening/reading screens, reading grading, 360/390/430px, no browser exceptions.');
} finally { await browser.close(); }
