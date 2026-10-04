import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: ['node24'],
  minify: false,
  sourcemap: true,
  outfile: 'dist/server/index.js',
});

console.log('API bundle written to dist/server/index.js');
