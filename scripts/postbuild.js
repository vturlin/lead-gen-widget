// Post-build: copy static assets into dist and report bundle size.
// Vite lib-mode does not run the public/ copy pipeline automatically,
// so we replicate it here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function copy(from, to) {
  fs.copyFileSync(from, to);
  console.log(`  ✓ ${path.relative(root, to)}`);
}

console.log('\n📦 Post-build:');

// Demo page + admin preview iframe page
for (const file of ['demo.html', 'transparent.html']) {
  const src = path.join(root, 'public', file);
  if (fs.existsSync(src)) {
    copy(src, path.join(dist, file));
  }
}

// Per-hotel configs (optional — populated by the admin app at publish time)
const configsFromDir = path.join(root, 'public/configs');
const configsToDir = path.join(dist, 'configs');
if (fs.existsSync(configsFromDir)) {
  fs.mkdirSync(configsToDir, { recursive: true });
  for (const file of fs.readdirSync(configsFromDir)) {
    if (file.endsWith('.json')) {
      copy(path.join(configsFromDir, file), path.join(configsToDir, file));
    }
  }
}

console.log('\n📊 Bundle size:');
for (const f of fs.readdirSync(dist)) {
  const stat = fs.statSync(path.join(dist, f));
  if (stat.isFile()) {
    const kb = (stat.size / 1024).toFixed(1);
    console.log(`  ${f.padEnd(24)} ${kb.padStart(7)} kB`);
  }
}
console.log('');
