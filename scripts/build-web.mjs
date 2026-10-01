// Copies the static site into www/, which Capacitor bundles into the native app.
// The website itself is served by Vercel straight from the repo root; this is only
// for the app build.

import { cpSync, mkdirSync, rmSync } from 'node:fs';

const OUT_DIR = 'www';
const FILES = [
  'index.html',
  'style.css',
  'js',
  'vendor',
  'data',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR);
for (const file of FILES) {
  cpSync(file, `${OUT_DIR}/${file}`, { recursive: true });
}
console.log(`Copied ${FILES.length} entries to ${OUT_DIR}/`);
