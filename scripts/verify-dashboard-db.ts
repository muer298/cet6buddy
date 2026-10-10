import assert from 'node:assert/strict';
import { createStoreFromEnv } from '../server/store-factory.ts';
import { availableContent, learningRecords } from '../server/learning-dashboard.ts';

// Read-only verification against the configured database. No login, no test rows, no DDL.
const runtime = await createStoreFromEnv();
try {
  assert.equal(runtime.driver, 'mysql');
  const end = new Date();
  const start = new Date(end.getTime() - 86400000);
  for (const username of ['kugua', 'muer']) {
    const user = await runtime.store.findUserByUsername(username);
    assert.ok(user, 'Expected internal account exists');
    const totals = await runtime.store.learningTotals(user.id, start.toISOString(), end.toISOString());
    assert.ok(Number.isFinite(totals.practicedWords) && totals.practicedWords >= 0);
    assert.ok(Number.isFinite(totals.todayPoints) && totals.todayPoints >= 0);
    const attempts = await runtime.store.learningActivity(user.id);
    assert.ok(attempts.every(a => a.userId === user.id));
    for (const filter of ['reviews', 'collections', 'mistakes']) assert.ok(Array.isArray(await learningRecords(runtime.store, user.id, filter)));
    assert.ok(Array.isArray(await availableContent(runtime.store, user.id)));
  }
  console.log('PASS: cloud MySQL read-only dashboard queries for both internal accounts; no records modified.');
} finally { await runtime.store.close?.(); }
