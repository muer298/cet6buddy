import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.ts';

async function body(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

test('health and plan expose stable server state', async () => {
  const { handle } = createApp();
  const health = await handle(new Request('http://local/health'));
  assert.equal(health.status, 200);
  assert.equal((await body(health)).status, 'ok');

  const plan = await handle(new Request('http://local/api/me/plan'));
  const planBody = await body(plan);
  assert.equal(plan.status, 200);
  assert.equal(planBody.timezone, 'Asia/Shanghai');
  assert.equal(planBody.tasks.length, 5);
});

test('CORS preflight returns the required headers without a response body', async () => {
  const { handle } = createApp();
  const response = await handle(new Request('http://local/api/study/sessions', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(await response.text(), '');
});

test('practice session never exposes answers before submission', async () => {
  const { handle } = createApp();
  const response = await handle(new Request('http://local/api/study/sessions', { method: 'POST', body: JSON.stringify({ source: 'due_reviews', mode: 'practice' }) }));
  const responseBody = await body(response);
  assert.equal(response.status, 201);
  assert.equal(responseBody.session.questions.length, 5);
  assert.equal('correctIndex' in responseBody.session.questions[0], false);
  assert.equal('explanation' in responseBody.session.questions[0], false);
});

test('answer submission is idempotent and locks the first answer', async () => {
  const { handle } = createApp();
  const created = await body(await handle(new Request('http://local/api/study/sessions', { method: 'POST', body: '{}' })));
  const sessionId = created.session.id as string;
  const payload = { question_id: 'w-sustainable', question_version: 1, answer: 1, idempotency_key: 'answer-001' };

  const first = await body(await handle(new Request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify(payload) })));
  const repeated = await body(await handle(new Request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify({ ...payload, answer: 0 }) })));
  const secondKey = await body(await handle(new Request(`http://local/api/sessions/${sessionId}/answers`, { method: 'POST', body: JSON.stringify({ ...payload, answer: 0, idempotency_key: 'answer-002' }) })));

  assert.equal(first.accepted, true);
  assert.equal(first.feedback.correct, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(secondKey.duplicate, true);
  assert.equal(first.attempt_id, repeated.attempt_id);
  assert.equal(first.attempt_id, secondKey.attempt_id);
});

test('version mismatch is rejected with a stable error code', async () => {
  const { handle } = createApp();
  const created = await body(await handle(new Request('http://local/api/study/sessions', { method: 'POST', body: '{}' })));
  const response = await handle(new Request(`http://local/api/sessions/${created.session.id}/answers`, {
    method: 'POST',
    body: JSON.stringify({ question_id: 'w-sustainable', question_version: 99, answer: 1, idempotency_key: 'version-test' }),
  }));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).error.code, 'QUESTION_VERSION_MISMATCH');
});

test('finishing a complete session awards daily points only once', async () => {
  const { handle } = createApp();
  const created = await body(await handle(new Request('http://local/api/study/sessions', { method: 'POST', body: '{}' })));
  const sessionId = created.session.id as string;
  for (const [index, question] of created.session.questions.entries()) {
    await handle(new Request(`http://local/api/sessions/${sessionId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id: question.id, question_version: question.version, answer: 0, idempotency_key: `finish-${index}` }),
    }));
  }
  const first = await body(await handle(new Request(`http://local/api/sessions/${sessionId}/finish`, { method: 'POST' })));
  const repeated = await body(await handle(new Request(`http://local/api/sessions/${sessionId}/finish`, { method: 'POST' })));
  assert.equal(first.result.answered, 5);
  assert.equal(first.reward.awarded, true);
  assert.equal(repeated.reward.awarded, false);
});
