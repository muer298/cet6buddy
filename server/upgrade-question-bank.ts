import { createStoreFromEnv } from './store-factory.ts';
import { legacyContent } from './legacy-content.ts';

// Explicit, idempotent data upgrade: new versions only; never rewrites historical payloads.
const runtime = await createStoreFromEnv();
try {
  const actor = (await runtime.store.listUsers()).find(user => user.role === 'admin' && user.status === 'active');
  if (!actor) throw new Error('An active administrator is required for the publication audit.');
  const current = await runtime.store.listContent();
  for (const entry of legacyContent) {
    const previous = current.find(item => item.id === entry.id || item.payload.seed_key === entry.payload.seed_key);
    if (previous?.payload.seed_key === entry.payload.seed_key) { console.log(`skip ${entry.id}: already upgraded`); continue; }
    if (!process.argv.includes('--apply')) { console.log(`planned ${entry.id}: ${previous ? 'new version' : 'new content'}`); continue; }
    const next = previous ? await runtime.store.createContentVersion(previous.id, entry.payload) : await runtime.store.createContent({ kind: entry.kind, visibility: 'public', ownerId: actor.id, payload: entry.payload });
    if (!next) throw new Error('Content version creation failed');
    await runtime.store.updateContentStatus(next.id, next.version, 'published', actor.id, '将既有演示题迁入数据库题库；非官方真题；保留旧版');
    console.log(`published ${entry.id} -> ${next.id} v${next.version}`);
  }
} finally { await runtime.store.close?.(); }
