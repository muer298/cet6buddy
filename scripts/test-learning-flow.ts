import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createApp } from '../server/app.ts';
import { InMemoryStore } from '../server/store.ts';
import { hashPassword } from '../server/auth.ts';
import type { ContentRecord } from '../server/types.ts';

// Diagnostic only: real production build + real API handlers, isolated in-memory users.
// No production credentials, accounts, learning records, or deployment are changed.
const origin = process.env.UI_ORIGIN ?? 'http://127.0.0.1:4188';
const store = new InMemoryStore();
const app = createApp(store, { authOptions: { secureCookie: false }, corsOrigin: origin });
const password = randomBytes(20).toString('hex');
const results: Array<{ name: string; status: string; details?: unknown }> = [];
const record = (name: string, pass: boolean, details?: unknown) => { const row = { name, status: pass ? 'PASS' : 'FAIL', details }; results.push(row); console.log(JSON.stringify(row)); };
const choice = { prompt: 'Choose the fixture answer', options: ['Correct', 'Incorrect', 'Other', 'Neither'], correct_index: 0, explanation: 'Fixture answer is the first option.' };
async function content(kind: string, payload: Record<string, unknown>) {
  const c = await store.createContent({ kind, visibility: 'public', payload: { ...payload, source: 'Isolated diagnostic fixture; never published online' } });
  await store.updateContentStatus(c.id, c.version, 'published', 'diagnostic');
  return c;
}
const words: ContentRecord[] = [];
for (let i = 0; i < 20; i++) words.push(await content('word', { ...choice, word: `fixture-${i}`, meaning: 'Correct' }));
const listening = await content('listening', { title: 'Diagnostic listening', audio_url: '/audio/small-habits.m4a', questions: [choice, { ...choice, prompt: 'Second listening question' }] });
const reading = await content('reading', { title: 'Diagnostic reading', passage: 'A short original passage for isolated tests.', questions: [choice, { ...choice, prompt: 'Second reading question' }] });
const translation = await content('translation', { prompt: 'Translate this diagnostic sentence.', references: ['This is a test.'] });
const writing = await content('writing', { prompt: 'Write an original sentence.', references: ['Learning takes practice.'] });
async function account(username: string) {
  const user = await store.createPasswordUser({ username, email: `${username}@test.invalid`, nickname: username, role: 'learner', passwordHash: await hashPassword(password), mustChangePassword: false });
  const login = await app.handle(new Request(`${origin}/api/auth/password/login`, { method: 'POST', body: JSON.stringify({ identifier: username, password }) }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await app.handle(new Request(`${origin}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: response.status, body: await response.json() as any };
  };
  return { user, cookie, call };
}
const main = await account('flow-learner');
const observer = await account('flow-observer');
await main.call('/api/teams', 'POST', { name: 'Isolated flow test' });
const teamRecord = [...store.teams.values()][0];
await observer.call('/api/teams/join', 'POST', { invite_code: teamRecord.inviteCode });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const errors: string[] = [];
let injectFinishFailure = false;
let injectCommittedFinishFailure = false;
let lastSession: any;
let lastGame: any;
await context.route('**/api/**', async route => {
  const req = route.request();
  if (injectFinishFailure && /\/sessions\/[^/]+\/finish$/.test(new URL(req.url()).pathname)) {
    injectFinishFailure = false;
    return route.fulfill({ status: 503, json: { error: { message: 'Injected finish network failure' } } });
  }
  const response = await app.handle(new Request(req.url(), { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() }));
  if (injectCommittedFinishFailure && /\/sessions\/[^/]+\/finish$/.test(new URL(req.url()).pathname)) {
    injectCommittedFinishFailure = false;
    return route.fulfill({ status: 503, json: { error: { message: 'Injected response loss after commit' } } });
  }
  const raw = await response.text();
  if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/study/sessions' && response.status === 201) lastSession = JSON.parse(raw).session;
  if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/games/sessions' && response.status === 201) lastGame = JSON.parse(raw).session;
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: raw });
});
await context.addCookies([{ name: main.cookie.split('=')[0], value: main.cookie.split('=')[1], url: origin, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error => errors.push(error.message));
let navigationId = 0;
async function navigate(route: string) { await page.goto(`${origin}/?flow=${++navigationId}#${route}`); }
async function snapshot(name: string, expected?: { task?: string; progress?: number; points?: number; mistakes?: number; collections?: number }) {
  const plan = (await main.call('/api/me/plan')).body;
  const summary = (await main.call('/api/me/learning-summary')).body;
  const board = (await main.call('/api/teams/me')).body.overview;
  const row = board.members.find((m: any) => m.userId === main.user.id);
  const check = { progress: Object.fromEntries(plan.tasks.map((t: any) => [t.key, t.completed])), points: plan.earned_points, practicedWords: summary.practicedWords, collections: summary.collections, mistakes: summary.mistakes, reviews: summary.reviews, weekly: row.points };
  await navigate('today');
  await page.waitForFunction(points => document.querySelector('.hero-kicker')?.textContent?.includes(`${points}/45`), plan.earned_points);
  const shownProgress = await page.locator('.task-meta').allTextContents();
  assert.deepEqual(shownProgress, plan.tasks.map((t: any) => `${t.completed}/${t.target}`));
  await page.getByRole('navigation').getByRole('button', { name: '我的', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.metric strong').length === 3);
  assert.deepEqual(await page.locator('.metric strong').allTextContents(), [summary.practicedWords, summary.collections, summary.mistakes].map(String));
  await page.getByRole('navigation').getByRole('button', { name: '周榜', exact: true }).click();
  await page.waitForFunction(points => document.querySelector('.hero h2')?.textContent === `${points} 分`, row.points);
  assert.ok((await page.locator('.leader').filter({ hasText: 'flow-learner' }).innerText()).includes(`${row.points} 分`));
  const other = (await observer.call('/api/me/learning-summary')).body;
  assert.equal(other.practicedWords + other.collections + other.mistakes + other.todayPoints, 0);
  const pass = summary.todayPoints === plan.earned_points && row.points === plan.earned_points && (!expected?.task || check.progress[expected.task] === expected.progress) && (expected?.points === undefined || check.points === expected.points) && (expected?.mistakes === undefined || summary.mistakes === expected.mistakes) && (expected?.collections === undefined || summary.collections === expected.collections);
  record(name, pass, check);
}
async function wordRound(source = 'new_words', wrongFirst = false, spelling = false) {
  await navigate(source === 'due_reviews' ? 'word?source=due_reviews' : 'word');
  await page.getByRole('button', { name: '确认答案', exact: true }).waitFor();
  const sessionId = lastSession.id;
  for (let i = 0; i < 5; i++) {
    await page.locator('.option').nth(wrongFirst && i === 0 ? 1 : 0).click();
    await page.getByRole('button', { name: '确认答案', exact: true }).click();
    await page.locator('.answer-feedback').waitFor();
    if (spelling && i === 0) {
      await page.getByPlaceholder('输入英文单词').fill(await page.locator('.word').innerText());
      await page.getByRole('button', { name: '提交', exact: true }).click();
      await page.getByText('拼写正确', { exact: true }).waitFor();
      await page.getByRole('button', { name: '收藏这个单词', exact: true }).click();
      await page.getByRole('button', { name: '已收藏', exact: true }).waitFor();
    }
    await page.getByRole('button', { name: i === 4 ? '查看本次结果' : '下一词', exact: true }).click();
    if (i < 4) await page.getByRole('button', { name: '确认答案', exact: true }).waitFor();
  }
  await page.getByRole('button', { name: '返回今日', exact: true }).waitFor();
  return sessionId;
}
async function inputRound(kind: 'listening' | 'reading', checkAudio = false) {
  await navigate(kind);
  if (kind === 'reading') await page.getByRole('button', { name: '题目', exact: true }).click();
  await page.locator('.option').first().waitFor();
  if (checkAudio) {
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    record('Listening playback and pause', true);
  }
  const sessionId = lastSession.id;
  for (let i = 0; i < 2; i++) {
    await page.locator('.option').first().click();
    await page.getByRole('button', { name: kind === 'reading' ? '提交阅读答案' : '提交听力答案', exact: true }).click();
    if (!i) await page.getByRole('button', { name: '下一题（2/2）', exact: true }).click();
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.option')].every(el => (el as HTMLButtonElement).disabled));
  for (let i = 0; i < 20 && store.sessions.get(sessionId)?.status !== 'finished'; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(store.sessions.get(sessionId)?.status, 'finished');
}
async function outputRound(kind: string) {
  await navigate(kind);
  await page.locator('textarea').fill('An original isolated diagnostic answer.');
  await page.getByText('意义完整', { exact: true }).click();
  await page.getByRole('button', { name: '保存作品与自检', exact: true }).click();
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor();
}
async function gameRound(route: string, expectedScore: number) {
  await navigate(route);
  await page.getByRole('button', { name: '锁定首次答案', exact: true }).waitFor();
  const count = lastGame.questions.length;
  for (let i = 0; i < count; i++) {
    await page.locator('.option').first().click();
    await page.getByRole('button', { name: '锁定首次答案', exact: true }).click();
    await page.getByRole('button', { name: i === count - 1 ? '结算本局' : '下一题', exact: true }).click();
  }
  await page.getByRole('heading', { name: `${expectedScore} 分`, exact: true }).waitFor();
}
try {
  await snapshot('Fresh account', { points: 0 });
  await wordRound('new_words', true, true);
  await snapshot('Words round 1: 5/10, spelling and collection', { task: 'new_words', progress: 5, points: 0, mistakes: 1, collections: 1 });
  // Keep retry probes separate from the normal browser journey.
  const duplicate = await account('flow-duplicate');
  const duplicateSession = (await duplicate.call('/api/study/sessions', 'POST', { source: 'new_words' })).body.session;
  for (const q of duplicateSession.questions) await duplicate.call(`/api/sessions/${duplicateSession.id}/answers`, 'POST', { question_id: q.id, question_version: q.version, answer: 0, idempotency_key: `duplicate-${q.id}` });
  await duplicate.call(`/api/sessions/${duplicateSession.id}/finish`, 'POST');
  const beforeDuplicate = (await duplicate.call('/api/me/plan')).body;
  const beforeInterval = [...store.reviews.values()].filter(r => r.userId === duplicate.user.id && r.skill === 'meaning').map(r => r.intervalDays);
  await duplicate.call(`/api/sessions/${duplicateSession.id}/finish`, 'POST');
  const afterDuplicate = (await duplicate.call('/api/me/plan')).body;
  record('Repeated finish must not increase progress or points', JSON.stringify(beforeDuplicate.tasks) === JSON.stringify(afterDuplicate.tasks) && beforeDuplicate.earned_points === afterDuplicate.earned_points, { before: beforeDuplicate.tasks.find((t: any) => t.key === 'new_words').completed, after: afterDuplicate.tasks.find((t: any) => t.key === 'new_words').completed, pointsBefore: beforeDuplicate.earned_points, pointsAfter: afterDuplicate.earned_points });
  const afterInterval = [...store.reviews.values()].filter(r => r.userId === duplicate.user.id && r.skill === 'meaning').map(r => r.intervalDays);
  record('Repeated finish must not advance review intervals', JSON.stringify(beforeInterval) === JSON.stringify(afterInterval), { beforeInterval, afterInterval });
  await wordRound();
  await snapshot('Words round 2: task and weekly points', { task: 'new_words', progress: 10, points: 10 });
  await navigate('study?filter=mistakes');
  await page.locator('.learning-record .option').first().click();
  await page.getByRole('button', { name: '提交订正', exact: true }).click();
  await page.getByText('当前没有待订正的学习错题。', { exact: true }).waitFor();
  await snapshot('Correction updates personal count, not points', { points: 10, mistakes: 0 });
  await inputRound('listening', true);
  await snapshot('Listening completed', { task: 'input', progress: 1, points: 20 });
  await inputRound('reading');
  await snapshot('Reading completed; shared input award only once', { task: 'input', progress: 1, points: 20 });
  await outputRound('translation');
  await snapshot('Translation saved: output 1/2', { task: 'output', progress: 1, points: 20 });
  await outputRound('writing');
  await snapshot('Writing saved: output 2/2 and weekly points', { task: 'output', progress: 2, points: 30 });
  for (const [route, score] of [['rootgame', 50], ['flashgame', 100], ['streakgame', 115]] as const) {
    await gameRound(route, score);
    await snapshot(`${route}: game progress and once-daily award`, { task: 'game', progress: 1, points: 35 });
  }
  // Seed past due dates only in the isolated test store, never change the system clock.
  for (const word of words) await store.updateReviewState(main.user.id, word.id, 'meaning', false, '2020-01-01T00:00:00Z');
  for (let i = 1; i <= 4; i++) {
    await wordRound('due_reviews');
    await snapshot(`Due words batch ${i}`, { task: 'review', progress: i * 5, points: i === 4 ? 45 : 35 });
  }
  await navigate('today');
  await page.getByRole('button', { name: '完成打卡', exact: true }).click();
  await page.getByText(/\d{4}-\d{2}-\d{2} 已打卡/).waitFor();
  record('Full daily check-in and 45 point cap', Boolean((await main.call('/api/me/checkin')).body.checkin));
  await page.reload();
  await snapshot('Refresh preserves all dashboard totals', { points: 45 });

  // Independent boundary scenarios so prior progress cannot hide defects.
  const edge = await account('flow-boundary');
  const partial = (await edge.call('/api/study/sessions', 'POST', { source: 'reading', content_item_id: reading.id })).body.session;
  await edge.call(`/api/sessions/${partial.id}/answers`, 'POST', { question_id: partial.questions[0].id, question_version: 1, answer: 0, idempotency_key: 'partial' });
  const partialFinish = await edge.call(`/api/sessions/${partial.id}/finish`, 'POST');
  const partialPlan = (await edge.call('/api/me/plan')).body;
  record('Incomplete reading must not complete input task', partialPlan.tasks.find((t: any) => t.key === 'input').completed === 0, { finishStatus: partialFinish.status, answered: 1, total: 2, progress: partialPlan.tasks.find((t: any) => t.key === 'input').completed, points: partialPlan.earned_points });
  const dueWord = words[0];
  await store.updateReviewState(edge.user.id, dueWord.id, 'spelling', false, '2020-01-01T00:00:00Z');
  await edge.call('/api/spelling-attempts', 'POST', { content_item_id: dueWord.id, content_version: 1, answer_text: 'fixture-0', idempotency_key: 'due-spelling' });
  const spellingPlan = (await edge.call('/api/me/plan')).body;
  record('Due spelling contributes to review task', spellingPlan.tasks.find((t: any) => t.key === 'review').completed === 1, { actual: spellingPlan.tasks.find((t: any) => t.key === 'review').completed, remainingSpelling: (await edge.call('/api/me/learning-summary')).body.reviews });
  await store.updateReviewState(edge.user.id, reading.id, 'reading', false, '2020-01-01T00:00:00Z');
  const inputReview = (await edge.call('/api/study/sessions', 'POST', { source: 'reading', content_item_id: reading.id })).body.session;
  for (const q of inputReview.questions) await edge.call(`/api/sessions/${inputReview.id}/answers`, 'POST', { question_id: q.id, question_version: q.version, answer: 0, idempotency_key: `input-review-${q.id}` });
  const reviewBefore = (await edge.call('/api/me/plan')).body.tasks.find((t: any) => t.key === 'review').completed;
  await edge.call(`/api/sessions/${inputReview.id}/finish`, 'POST');
  const reviewAfter = (await edge.call('/api/me/plan')).body.tasks.find((t: any) => t.key === 'review').completed;
  record('Due reading contributes to review task', reviewAfter === reviewBefore + 1, { reviewBefore, reviewAfter, remainingDue: (await edge.call('/api/me/learning-summary')).body.reviews });
  const payload = { module: 'translation', prompt_id: translation.id, response_text: 'Same submission repeated', self_check: {} };
  await edge.call('/api/open-submissions', 'POST', payload);
  const outputBefore = (await edge.call('/api/me/plan')).body;
  await edge.call('/api/open-submissions', 'POST', payload);
  const outputAfter = (await edge.call('/api/me/plan')).body;
  record('Retried output save must not double task progress', outputBefore.tasks.find((t: any) => t.key === 'output').completed === outputAfter.tasks.find((t: any) => t.key === 'output').completed, { before: outputBefore.tasks.find((t: any) => t.key === 'output').completed, after: outputAfter.tasks.find((t: any) => t.key === 'output').completed, pointsBefore: outputBefore.earned_points, pointsAfter: outputAfter.earned_points });

  await navigate('reading');
  await page.getByRole('button', { name: '题目', exact: true }).click();
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: '提交阅读答案', exact: true }).click();
  await page.getByRole('button', { name: '下一题（2/2）', exact: true }).click();
  await page.locator('.option').first().click();
  injectFinishFailure = true;
  await page.getByRole('button', { name: '提交阅读答案', exact: true }).click();
  await page.getByText('Injected finish network failure', { exact: true }).waitFor();
  const retryButtons = await page.getByRole('button', { name: /重试|重新结算/ }).count();
  record('Input finish failure offers a usable retry', retryButtons > 0 || await page.getByRole('button', { name: '提交阅读答案', exact: true }).isEnabled(), { sessionStatus: store.sessions.get(lastSession.id)?.status, submitDisabled: await page.getByRole('button', { name: '提交阅读答案', exact: true }).isDisabled(), retryButtons });
  const retrySessionId = lastSession.id;
  const beforeRetryPlan = (await main.call('/api/me/plan')).body;
  await page.reload();
  await page.getByRole('button', { name: '重试结算', exact: true }).click();
  await page.getByText('本组练习已结算，任务进度和统计已更新。', { exact: true }).waitFor();
  record('Reload restores pending input settlement and retry succeeds', store.sessions.get(retrySessionId)?.status === 'finished' && lastSession.id === retrySessionId);
  const afterRetryPlan = (await main.call('/api/me/plan')).body;
  record('Retry keeps daily cap and existing task credits unchanged', JSON.stringify(beforeRetryPlan.tasks) === JSON.stringify(afterRetryPlan.tasks) && beforeRetryPlan.earned_points === afterRetryPlan.earned_points);
  injectCommittedFinishFailure = true;
  await inputRound('reading');
  await page.getByText('Injected response loss after commit', { exact: true }).waitFor();
  const committedId = lastSession.id;
  const intervalsBeforeRetry = JSON.stringify([...store.reviews.values()].filter(r => r.userId === main.user.id));
  await page.reload();
  await page.getByRole('button', { name: '重试结算', exact: true }).click();
  await page.getByText('本组练习已结算，任务进度和统计已更新。', { exact: true }).waitFor();
  record('Lost response after commit resumes same session without repeating review updates', lastSession.id === committedId && JSON.stringify([...store.reviews.values()].filter(r => r.userId === main.user.id)) === intervalsBeforeRetry);
  const fresh = await account('flow-no-due');
  const freshPlan = (await fresh.call('/api/me/plan')).body;
  const freshDue = (await fresh.call('/api/me/learning-summary')).body.reviews;
  for (const task of freshPlan.tasks.filter((t: any) => t.key !== 'review')) await store.incrementDailyTask(fresh.user.id, freshPlan.server_date, task.key, task.target, 'standard');
  const freshCheckin = await fresh.call('/api/me/checkin', 'POST');
  record('No-due account should not be blocked by impossible review target', freshCheckin.status === 201, { due: freshDue, mandatoryReviewTarget: freshPlan.tasks.find((t: any) => t.key === 'review').target, checkinStatus: freshCheckin.status, pending: freshCheckin.body.error?.details?.pending });
  record('No browser runtime errors', errors.length === 0, errors);
} catch (cause) {
  record('Harness stopped unexpectedly', false, cause instanceof Error ? cause.stack : String(cause));
} finally {
  await browser.close();
  console.log(JSON.stringify({ summary: { passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length }, results }, null, 2));
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
}
