import { readFile } from 'node:fs/promises';
import { createStoreFromEnv } from './store-factory.ts';

interface ListeningOrReading {
  id: string;
  title: string;
  source: string;
  questions: unknown[];
  transcript?: string;
  passage?: string;
}

const runtime = await createStoreFromEnv();
try {
  const current = await runtime.store.listContent();
  const known = new Set(current.map(item => String(item.payload.seed_key ?? '')));
  const words = (await readFile(new URL('../content/pilot/words.csv', import.meta.url), 'utf8')).trim().split(/\r?\n/).slice(1);
  const listening = JSON.parse(await readFile(new URL('../content/pilot/listening.json', import.meta.url), 'utf8')) as ListeningOrReading[];
  const reading = JSON.parse(await readFile(new URL('../content/pilot/reading.json', import.meta.url), 'utf8')) as ListeningOrReading[];
  const output = JSON.parse(await readFile(new URL('../content/pilot/output.json', import.meta.url), 'utf8')) as { translation: string[]; writing: string[] };
  const entries: Array<{ key: string; kind: string; payload: Record<string, unknown> }> = [];
  for (const [word, meaning] of words.map(line => line.split(',', 2))) entries.push({ key: `pilot-word-${word}`, kind: 'word', payload: { word, meaning, source: 'CET6 Buddy 原创试用内容' } });
  for (const item of listening) entries.push({ key: item.id, kind: 'listening', payload: { ...item, asset_id: `pending-audio-${item.id}` } });
  for (const item of reading) entries.push({ key: item.id, kind: 'reading', payload: { ...item } });
  output.translation.forEach((prompt, index) => entries.push({ key: `pilot-translation-${index + 1}`, kind: 'translation', payload: { prompt, references: ['由编辑在审核时补充等价参考表达'], source: 'CET6 Buddy 原创试用内容' } }));
  output.writing.forEach((prompt, index) => entries.push({ key: `pilot-writing-${index + 1}`, kind: 'writing', payload: { prompt, references: [prompt], source: 'CET6 Buddy 原创试用内容' } }));

  let created = 0;
  for (const entry of entries) {
    if (known.has(entry.key)) continue;
    await runtime.store.createContent({ kind: entry.kind, visibility: 'public', payload: { seed_key: entry.key, ...entry.payload } });
    created += 1;
  }
  console.log(`Pilot content ready: ${entries.length} records (${created} created, ${entries.length - created} already present).`);
} finally {
  await runtime.store.close?.();
}
