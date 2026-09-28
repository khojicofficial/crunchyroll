/**
 * Headless smoke test for the extension popup preview.
 *
 * Loads /popup/ in jsdom — the real `dist/webextension/content/popup.js` bundle on top of
 * the `chrome.*` shim — and checks that the Vue app mounts and lists the mocked MAL data
 * with the right titles, scores and progress.
 *
 * Usage: node dev-preview/test/popup-smoke.mjs [baseUrl]
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const url = '/popup/';

function waitFor(check, timeout = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const result = check();
      if (result) return resolve(result);
      if (Date.now() - start > timeout) return reject(new Error('timeout'));
      setTimeout(poll, 150);
    };
    poll();
  });
}

/** jsdom gaps that every real browser fills in. */
function browserStubs(window) {
  window.matchMedia =
    window.matchMedia ||
    (query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }));
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.fetch = (input, init) => {
    const target = typeof input === 'string' ? new URL(input, window.location.href).href : input;
    return fetch(target, init);
  };
}

const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', error => pageErrors.push(error.message));
virtualConsole.on('error', (...args) =>
  pageErrors.push(
    args.map(arg => (arg instanceof Error ? arg.message : String(arg))).join(' '),
  ),
);

const html = await fetch(base + url).then(r => r.text());
const dom = new JSDOM(html, {
  url: base + url,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse: browserStubs,
});

const document = dom.window.document;
let failures = 0;
let error = null;

try {
  await waitFor(() => document.querySelectorAll('.book-element').length >= 4);
} catch (e) {
  error = e;
}

const banner = document.querySelector('#preview-popup-banner') ? 'yes' : 'no';
const nav = document.querySelectorAll('.nav .material-icons').length;
const cards = [...document.querySelectorAll('.book-element')].map(card =>
  card.textContent.replace(/\s+/g, ' ').trim(),
);
const images = [...document.querySelectorAll('.book-element img')].map(img =>
  img.getAttribute('src'),
);
const status = document.querySelector('#status-card')?.textContent.trim() || '';

const expect = {
  'watching card · Solo Leveling': cards.find(c => /Solo Leveling/.test(c)) || '',
  'watching card · Re:ZERO (english title)': cards.find(c => /Re:ZERO/.test(c)) || '',
  'watching card · Frieren (english title)': cards.find(c => /Frieren/.test(c)) || '',
  'watching card · 86 EIGHTY-SIX': cards.find(c => /86 EIGHTY-SIX/.test(c)) || '',
  'cover images served': images.length >= 4 ? 'yes' : 'no',
};

console.log(`\n▶ extension popup · ${url}`);
console.log(`  preview banner: ${banner}`);
console.log(`  nav icons: ${nav}`);
console.log(`  bookmark cards: ${cards.length}`);
if (status) console.log(`  status: ${status.replace(/\s+/g, ' ')}`);

if (error) {
  console.log(`  ✖ ${error.message}`);
  failures += 1;
} else {
  Object.entries(expect).forEach(([name, value]) => {
    const ok = name === 'cover images served' ? value === 'yes' : Boolean(value);
    console.log(`  ${ok ? '✔' : '✖'} ${name}: ${JSON.stringify(value)}`);
    if (!ok) failures += 1;
  });

  const solo = cards.find(c => /Solo Leveling/.test(c));
  const progressOk = /Episode:\s*5\s*\/\s*12/.test(solo || '');
  console.log(
    `  ${progressOk ? '✔' : '✖'} progress from MAL fixture (episode 5/12): ${JSON.stringify(solo)}`,
  );
  if (!progressOk) failures += 1;

  const alternativeTitleOk = cards.some(c => /Re:ZERO -Starting Life in Another World-/.test(c));
  console.log(`  ${alternativeTitleOk ? '✔' : '✖'} forceEnglishTitles setting applied`);
  if (!alternativeTitleOk) failures += 1;
}

const noisy = pageErrors.filter(e => !/Could not load|NetworkError|fetch failed|ECONNREFUSED|chibi\.malsync\.moe|Not implemented/i.test(e));
if (noisy.length) {
  console.log('  page errors:');
  noisy.slice(0, 5).forEach(e => console.log(`    ! ${e.slice(0, 200)}`));
  failures += 1;
}

dom.window.close();

console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n✅ all checks passed');
process.exit(failures ? 1 : 0);
