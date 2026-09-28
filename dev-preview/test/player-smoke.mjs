/**
 * Headless smoke test for the standalone CrunchyrollPlayer package (/player/).
 *
 * Loads the demo page in jsdom and drives the player like a user would: play, seek,
 * captions, speed menu, keyboard shortcuts, episode switching.
 *
 * Usage: node dev-preview/test/player-smoke.mjs [baseUrl]
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const url = '/player/';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = check();
    if (result) return result;
    await sleep(100);
  }
  throw new Error('timeout');
}

const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', error => pageErrors.push(error.message));
virtualConsole.on('error', (...args) =>
  pageErrors.push(args.map(arg => (arg instanceof Error ? arg.message : String(arg))).join(' ')),
);

const html = await fetch(base + url).then(r => r.text());
const dom = new JSDOM(html, {
  url: base + url,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
});

const window = dom.window;
const document = window.document;
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failures += 1;
}

console.log(`\n▶ standalone player · ${url}`);

try {
  const demo = await waitFor(() => window.CrunchyrollPlayerDemo);
  const player = demo.player;
  const root = player.root;

  const events = { play: 0, pause: 0, timeupdate: 0, seek: 0, ratechange: 0 };
  Object.keys(events).forEach(name =>
    root.addEventListener(`crp:${name}`, () => {
      events[name] += 1;
    }),
  );

  // 1. shell rendered
  check('controls rendered', Boolean(root.querySelector('[data-t="toggle"]')));
  check('progress bar rendered', Boolean(root.querySelector('[data-t="progress"]')));
  check('poster title from options', root.querySelector('[data-t="poster-title"]').textContent, 'Solo Leveling');
  check('starts paused', player.getState().paused === true);

  // 2. play through the button, clock advances
  root.querySelector('[data-t="toggle"]').click();
  check('click on play button starts playback', root.classList.contains('crp--playing'));
  const before = player.getState().currentTime;
  await waitFor(() => player.getState().currentTime > before + 1.2);
  check('simulated clock advances', player.getState().currentTime > before, player.getState().currentTime.toFixed(1));
  check('time label follows the clock', root.querySelector('[data-t="time"]').textContent === '0:01 / 24:00', root.querySelector('[data-t="time"]').textContent);

  // 3. seeking + captions
  player.seek(600);
  check('seek(600) lands on 10:00', root.querySelector('[data-t="time"]').textContent.startsWith('10:00'), root.querySelector('[data-t="time"]').textContent);
  check('progress bar follows the position', Number(root.querySelector('[data-t="progress"]').getAttribute('aria-valuenow')) >= 41, root.querySelector('[data-t="progress"]').getAttribute('aria-valuenow'));

  player.seek(3);
  const caption = await waitFor(() => {
    const box = root.querySelector('[data-t="captions"]');
    return box.hidden ? null : box.textContent;
  });
  check('captions show inside their window', caption.length > 0, caption);

  // 4. speed menu
  root.querySelector('[data-t="settings"]').click();
  check('settings menu opens', !root.querySelector('[data-t="menu"]').hidden);
  root.querySelector('.crp__rate[data-rate="1.5"]').click();
  check('setRate(1.5) applied', player.getState().rate === 1.5);
  check('settings menu closes after picking a rate', root.querySelector('[data-t="menu"]').hidden === true);

  // 5. keyboard shortcuts
  const seekBefore = player.getState().currentTime;
  root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check('→ seeks forward 10s', Math.round(player.getState().currentTime - seekBefore) === 10, player.getState().currentTime - seekBefore);
  root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true }));
  check('m toggles mute', player.getState().muted === true);

  // 6. controller API used by the demo buttons
  document.querySelector('[data-cmd="seek480"]').click();
  check('demo button calls seek(8:00)', Math.round(player.getState().currentTime) === 480, player.getState().currentTime);

  // 7. episode switching from the up-next list
  const secondEpisode = document.querySelectorAll('.episode')[1];
  secondEpisode.click();
  check('episode switch updates the poster title', root.querySelector('[data-t="poster-title"]').textContent, 'Re:ZERO -Starting Life in Another World-');
  check('episode switch resets the position', player.getState().currentTime === 0);

  // 8. events fired
  check('crp:play fired', events.play >= 1, events.play);
  check('crp:timeupdate fired while playing', events.timeupdate >= 10, events.timeupdate);
  check('crp:seek fired', events.seek >= 4, events.seek);
  check('crp:ratechange fired', events.ratechange >= 1, events.ratechange);

  // 9. second instance + destroy
  check('second instance mounted', Boolean(demo.mini.root.querySelector('[data-t="toggle"]')));
  demo.mini.destroy();
  check('destroy() empties the container', demo.mini.root.innerHTML === '');

  check('exposes version', typeof window.CrunchyrollPlayer.version === 'string', window.CrunchyrollPlayer.version);
} catch (error) {
  console.log(`  ✖ ${error.message}`);
  failures += 1;
}

const noisy = pageErrors.filter(e => !/Could not load|NetworkError|fetch failed|ECONNREFUSED|Not implemented/i.test(e));
if (noisy.length) {
  console.log('  page errors:');
  noisy.slice(0, 5).forEach(e => console.log(`    ! ${e.slice(0, 200)}`));
  failures += 1;
}

window.close();
console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n✅ all checks passed');
process.exit(failures ? 1 : 0);
