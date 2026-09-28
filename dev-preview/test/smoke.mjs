/**
 * Headless smoke test for the preview.
 *
 * Loads the mock Crunchyroll pages in jsdom and checks that the real chibi scripts
 * extract the expected values. Requires the preview server to be reachable
 * (npm run preview) and `jsdom` installed (`npm i --no-save jsdom`).
 *
 * Usage: node dev-preview/test/smoke.mjs [baseUrl]
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const base = process.argv[2] || 'http://127.0.0.1:4173';

const scenarios = [
  {
    name: 'watch page · Solo Leveling S1 E5',
    url: '/crunchyroll/watch/G9VU2PW0J/solo-leveling-episode-5',
    expect: {
      'sync.isSyncPage': true,
      'sync.getTitle': 'solo leveling',
      'sync.getEpisode': 5,
      'sync.getIdentifier': 'GY9P765D1|solo-leveling',
    },
  },
  {
    name: 'watch page · Re:ZERO S2 E3',
    url: '/crunchyroll/watch/G8VG4VK90/rezero-starting-life-in-another-world-season-2-episode-3',
    expect: {
      'sync.isSyncPage': true,
      'sync.getTitle': 'rezero starting life in another world Season 2',
      'sync.getEpisode': 3,
      'sync.getIdentifier': 'GRVG4VK72|rezero-starting-life-in-another-world-season-2',
    },
  },
  {
    name: 'watch page · Attack on Titan Final Season E5',
    url: '/crunchyroll/watch/G6KQ9P51M/attack-on-titan-final-season-episode-5',
    expect: {
      'sync.isSyncPage': true,
      'sync.getTitle': 'attack on titan Final Season',
      'sync.getEpisode': 5,
      'sync.getIdentifier': 'GRKQ9P40Y|attack-on-titan-final-season',
    },
  },
  {
    name: 'series page · Re:ZERO season 2 overview',
    url: '/crunchyroll/series/GRVG4VK72/rezero-starting-life-in-another-world-season-2',
    expect: {
      'overview.isOverviewPage': true,
      'overview.getTitle': 'rezero starting life in another world Season 2',
      'overview.getIdentifier': 'GRVG4VK72|rezero-starting-life-in-another-world-season-2',
    },
  },
];

function parseDetectionTable(document) {
  const values = {};
  document.querySelectorAll('#detection-table .row').forEach(row => {
    const key = row.querySelector('.key').textContent.trim();
    const value = row.querySelector('.value').textContent.trim();
    values[key] = value;
  });
  return values;
}

async function waitFor(check, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('timeout');
}

let failures = 0;

for (const scenario of scenarios) {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', error => pageErrors.push(error.message));
  virtualConsole.on('error', (...args) => pageErrors.push(args.join(' ')));

  const html = await fetch(base + scenario.url).then(r => r.text());
  const dom = new JSDOM(html, {
    url: base + scenario.url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
  });

  // jsdom has no fetch: hand the page Node's implementation.
  dom.window.fetch = (input, init) => {
    const url = typeof input === 'string' ? new URL(input, dom.window.location.href).href : input;
    return fetch(url, init);
  };

  let values = {};
  let error = null;
  try {
    // The Crunchyroll CMS response arrives through the request proxy, so wait for the
    // panel to show real values instead of the initial empty detection pass.
    const readyKey = scenario.url.includes('/series/') ? 'getTitle()' : 'getEpisode()';
    await waitFor(() => {
      const table = parseDetectionTable(dom.window.document);
      if (process.env.SMOKE_DEBUG) console.log('   poll:', JSON.stringify(table));
      const ready = table[readyKey];
      if (ready && ready !== 'undefined' && ready !== 'null') {
        values = table;
        return true;
      }
      return false;
    });
  } catch (e) {
    error = e;
  }

  const listRows = dom.window.document.querySelectorAll('#list-table .row').length;
  const status = dom.window.document.querySelector('#status-card')?.textContent.trim() || '(no status)';

  console.log(`\n▶ ${scenario.name}`);
  console.log(`  status: ${status.replace(/\s+/g, ' ')}`);
  console.log(`  list rows: ${listRows}`);
  if (error) {
    console.log(`  ✖ ${error.message}`);
    failures += 1;
  } else {
    Object.entries(scenario.expect).forEach(([key, expected]) => {
      const actual = values[key === 'overview.isOverviewPage' ? 'isOverviewPage()' : `${key.split('.')[1]}()`];
      const ok = String(actual) === String(expected);
      console.log(`  ${ok ? '✔' : '✖'} ${key} = ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
      if (!ok) failures += 1;
    });
  }

  const noisy = pageErrors.filter(
    e =>
      !/Could not load|NetworkError|fetch failed|ECONNREFUSED|chibi\.malsync\.moe|Not implemented/i.test(
        e,
      ),
  );
  if (noisy.length) {
    console.log('  page errors:');
    noisy.slice(0, 5).forEach(e => console.log(`    ! ${e.slice(0, 200)}`));
    failures += 1;
  }

  dom.window.close();
}

console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n✅ all checks passed');
process.exit(failures ? 1 : 0);
