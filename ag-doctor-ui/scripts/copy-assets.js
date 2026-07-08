/**
 * Copies HTML, CSS, and JS assets to dist/renderer/.
 * Runs BEFORE tsc so the compiled app.js (written by tsc) is preserved.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const DST = path.join(ROOT, 'dist', 'renderer');

// Only copy files that tsc won't generate (.html, .css, .svg, .png, etc.)
const COPY_EXT = new Set(['.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.json']);

function shouldCopy(filename) {
  return COPY_EXT.has(path.extname(filename).toLowerCase());
}

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!shouldCopy(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyRecursive(SRC, DST);

// Copy top-level assets (icons, tray icons)
const ASSETS_SRC = path.join(ROOT, 'assets');
const ASSETS_DST = path.join(ROOT, 'dist', 'assets');
if (fs.existsSync(ASSETS_SRC)) {
  fs.mkdirSync(ASSETS_DST, { recursive: true });
  for (const entry of fs.readdirSync(ASSETS_SRC, { withFileTypes: true })) {
    if (!shouldCopy(entry.name)) continue;
    fs.copyFileSync(path.join(ASSETS_SRC, entry.name), path.join(ASSETS_DST, entry.name));
  }
}

console.log(`✓ copied assets → ${path.relative(ROOT, DST)}`);
