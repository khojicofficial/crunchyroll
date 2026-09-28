# MAL-Sync offline preview

A local, dependency-free preview of this branch's Crunchyroll integration. It runs the
**real compiled extension code** against a **mock Crunchyroll site**, because the sandbox
(and CI) cannot reach `crunchyroll.com`, `api.myanimelist.net` or `chibi.malsync.moe`.

```bash
# optional extras the preview and its tests need (not in package.json on purpose)
npm i --no-save --engine-strict=false jsdom material-icons @fontsource/montserrat

npm run build          # once: builds dist/webextension (background, content, chibi pages)
npm run preview:setup  # stages popup HTML + vendored jQuery/fonts into dist/webextension
npm run preview:build  # once (and after changing src/chibiScript or src/pages-chibi)
npm run preview        # http://localhost:4173
npm run preview:test   # headless smoke tests (needs the server running)
```

| Route                     | What it is                                                                        |
| ------------------------- | --------------------------------------------------------------------------------- |
| `/`                       | Landing page: labs, catalogue, stale/real summary                                 |
| `/crunchyroll/watch/…`    | Mock Crunchyroll episode page + MAL-Sync preview panel (sync page scenario)        |
| `/crunchyroll/series/…`   | Mock Crunchyroll series page + panel (overview scenario)                           |
| `/popup/`                 | The real `dist/webextension/content/popup.js` bundle on a `chrome.*` shim          |
| `/player/`                | Standalone CrunchyrollPlayer demo (`dev-preview/standalone/…`)                     |
| `/download/*.zip`         | Packaged downloads — the standalone player zip                                    |
| `/chibi/*`                | `dist/webextension/chibi/*` — the compiled chibi pages and `list.json`             |
| `/extension/*`            | `dist/webextension/*` — e.g. the real `content/proxy/proxy_request.js`             |
| `/mock/crunchyroll/*`     | Fake Crunchyroll CMS (`/cms/objects/:id`, `/cms/series/:id/seasons`)               |
| `/mock/mal/*`             | Fake MAL v2 list/user endpoints used by the popup                                  |

Add `?debug=1` to a lab URL to trace every chibi run and registry write in the console.

## Standalone player

The player used on the mock watch page is also available as a self-contained package:

```bash
npm run preview:zip   # -> dev-preview/public/download/crunchyroll-player.zip
                      #    and <workspace>/crunchyroll-player.zip
```

Source lives in `dev-preview/standalone/crunchyroll-player/` (js + css + demo + README), the
zip is served at `/download/crunchyroll-player.zip` and the demo runs at `/player/`.
It has no dependencies: simulated clock by default, `attachVideo()` to drive a real
`<video>` element.

## What is real, what is mocked

Real (the code under test):

- `ChibiProxy.Chibi()`, `ChibiListRepository`, `ChibiConsumer` — the interpreter shipped in the
  extension, executing the compiled `chibi/pages/Crunchyroll.json` AST.
- `content/proxy/proxy_request.js` — injected into the mock page, intercepts its `fetch()`
  and re-dispatches `malsync-xhr*` events, exactly like on crunchyroll.com.
- The popup bundle, its Vue app, settings, theming, manifest and `_provider/listFactory`.

Mocked (environment only):

- The Crunchyroll website (URL shapes + DOM hooks) and its CMS payloads.
- The MAL API payloads and `api.*` (extension storage / background messaging):
  `src/apiStub.ts` for the page harness, `public/popup-shim.js` for the popup.

## Tests

```bash
npm run preview:test                   # both suites
node dev-preview/test/smoke.mjs        # 4 scenarios: 3 watch pages + 1 overview page
node dev-preview/test/popup-smoke.mjs  # popup: bookmarks list from the mocked MAL data
node dev-preview/test/player-smoke.mjs # standalone player: playback, seeking, captions
```

They need the preview server running and `jsdom` installed (see above).

## Notes / quirks

- `proxy_request.js` buffers every request until the content script signals
  `malsync-xhr-start`, then replays the whole queue in one burst. All replayed callbacks share
  a single chibi context, so only the **last** queued URL is visible to the script. The mock
  site therefore re-issues the episode/seasons request when it sees `malsync-xhr-start` — the
  same thing that happens on the real site as soon as you navigate between episodes.
- `npm run build` normally downloads Google Fonts from `webpackConfig/resources.json`; that is
  blocked in the sandbox, so the fonts and jQuery are served from `dev-preview/public/vendor`
  and `npm run preview:setup` copies them (and the popup/settings HTML shells) into
  `dist/webextension/`.
- `dev-preview/` is a development tool and is not part of the shipped extension.
