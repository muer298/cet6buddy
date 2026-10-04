import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/assets', { recursive: true });

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['es2022'],
  outdir: 'dist/assets',
  entryNames: 'app',
  assetNames: '[name]-[hash]',
  jsx: 'automatic',
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
    'import.meta.env.DEV': 'false',
  },
});

const source = (await readFile('index.html', 'utf8'))
  .replace('    <link rel="stylesheet" href="./styles.css" />\n', '');
const html = source.replace(
  '<script type="module" src="/src/main.tsx"></script>',
  '<link rel="stylesheet" href="/assets/app.css" />\n    <script type="module" src="/assets/app.js"></script>',
);
await writeFile('dist/index.html', html);

console.log('Production bundle written to dist/');
