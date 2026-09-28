/**
 * Stages everything the preview needs on top of the normal build output.
 *
 * `npm run build` writes dist/webextension without the popup/settings HTML files, the
 * vendor folder (jQuery, fonts) and the icon assets — the build downloads those from the
 * Google Fonts CDN, which is not reachable from a sandbox. This script fills those gaps
 * from npm packages and from files committed in the repository, so the preview (and
 * /popup/) works completely offline.
 *
 *   npm i --no-save --engine-strict=false jsdom material-icons @fontsource/montserrat
 *   npm run preview:setup
 *
 * Usage: node dev-preview/setup-vendor.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const publicDir = path.join(__dirname, 'public');
const vendorDir = path.join(publicDir, 'vendor');
const distDir = path.join(repoRoot, 'dist', 'webextension');

const missingPackages = new Set();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(from, to, required = true) {
  if (!fs.existsSync(from)) {
    if (required) console.warn(`  ! missing source: ${path.relative(repoRoot, from)}`);
    return false;
  }
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return true;
}

/** npm packages are optional: the files are also committed under dev-preview/public. */
function copyPackage(prefix, from, to) {
  const source = path.join(repoRoot, 'node_modules', from);
  if (!fs.existsSync(source)) {
    missingPackages.add(prefix);
    return false;
  }
  return copy(source, to, false);
}

if (!fs.existsSync(distDir)) {
  console.error('dist/webextension not found — run `npm run build` first.');
  process.exit(1);
}

let copied = 0;

// 1. Vendored jQuery + fonts, used by the mock page, the preview panel and the popup.
copyPackage('jquery', 'jquery/dist/jquery.min.js', path.join(vendorDir, 'jquery.min.js')) &&
  (copied += 1);
for (const format of ['woff2', 'woff']) {
  copyPackage(
    'material-icons',
    `material-icons/iconfont/material-icons.${format}`,
    path.join(vendorDir, 'fonts', `material-icons.${format}`),
  ) && (copied += 1);
}
for (const weight of [400, 500, 600, 700, 800]) {
  copyPackage(
    '@fontsource/montserrat',
    `@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff2`,
    path.join(vendorDir, 'fonts', `montserrat-latin-${weight}-normal.woff2`),
  ) && (copied += 1);
}

// 2. Popup / window / settings HTML shells, normally written by webextension.assets.js
for (const page of ['popup', 'window', 'settings', 'sidebar', 'install']) {
  copy(
    path.join(repoRoot, 'src', '_minimal', `${page}.html`),
    path.join(distDir, `${page}.html`),
    false,
  ) && (copied += 1);
}

// 3. The extension's vendor folder + icon assets (both normally fetched by the build)
for (const file of ['jquery.min.js', 'materialFont.css', 'montserrat.css']) {
  copy(path.join(vendorDir, file), path.join(distDir, 'vendor', file)) && (copied += 1);
}
const fontDir = path.join(vendorDir, 'fonts');
if (fs.existsSync(fontDir)) {
  for (const font of fs.readdirSync(fontDir)) {
    copy(path.join(fontDir, font), path.join(distDir, 'vendor', 'fonts', font)) && (copied += 1);
  }
}
const assets = path.join(repoRoot, 'assets');
if (fs.existsSync(assets)) fs.cpSync(assets, distDir, { recursive: true });

console.log(`staged ${copied} file(s) into dist/webextension`);
if (missingPackages.size) {
  console.log(
    `fonts/jquery sources missing for: ${[...missingPackages].join(', ')} — run\n` +
      '  npm i --no-save --engine-strict=false jsdom material-icons @fontsource/montserrat',
  );
}
console.log('preview ready: npm run preview  ->  http://localhost:4173');
