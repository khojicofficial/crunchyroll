/**
 * MAL-Sync preview harness.
 *
 * This bundle contains the *real* MAL-Sync code paths used on Crunchyroll:
 *
 *   ChibiProxy.Chibi()          -> ChibiListRepository (loads /chibi/pages/Crunchyroll.json)
 *   ChibiProxy.Chibi()          -> page proxy whose methods run the compiled chibi scripts
 *   ChibiConsumer               -> the chibi script interpreter
 *
 * The only mocked part is the extension API (`apiStub.ts`) and, obviously, the
 * Crunchyroll page itself. Everything from the page script downwards is the
 * exact code that ships in the built extension.
 */

import { Chibi } from '../../src/pages-chibi/ChibiProxy';
import type { pageInterface } from '../../src/pages/pageInterface';
import { ChibiConsumer } from '../../src/chibiScript/ChibiConsumer';
import { ChibiJson } from '../../src/chibiScript/ChibiGenerator';
import { ChibiRegistry, chibiRegistrySingleton } from '../../src/chibiScript/ChibiRegistry';

// Optional tracing of chibi registry writes and script runs (`?debug=1` in the URL).
if (new URLSearchParams(window.location.search).get('debug')) {
  (window as any).__MALSYNC_DEBUG__ = true;
}

if ((window as any).__MALSYNC_DEBUG__) {
  const originalSet = ChibiRegistry.prototype.set;
  ChibiRegistry.prototype.set = function patchedSet(key: string, value: any) {
    console.log('[preview] registry.set', key, value);
    return originalSet.call(this, key, value);
  };

  let runCounter = 0;
  const originalAsync = (ChibiConsumer.prototype as any)._subroutineAsync;
  (ChibiConsumer.prototype as any)._subroutineAsync = function patchedAsync(script: any, startState: any) {
    const id = ++runCounter;
    console.log(
      `[preview] chibi run#${id} start`,
      JSON.stringify(script)?.slice(0, 50),
      'state=',
      JSON.stringify(startState)?.slice(0, 60),
    );
    const result = originalAsync.call(this, script, startState);
    Promise.resolve(result).then(
      value => console.log(`[preview] chibi run#${id} done ->`, value),
      error => console.log(`[preview] chibi run#${id} failed ->`, error && error.message),
    );
    return result;
  };
}

const PAGE_KEY = 'Crunchyroll';

/**
 * The chibi list repository asks the extension for its bundled collections via
 * `chrome.runtime.getURL('chibi')`. The dev server serves `dist/webextension/chibi`
 * under `/chibi`, so the real built page JSON is loaded here.
 */
function installChromeShim() {
  const shim = {
    runtime: {
      getURL: (path: string) => `/${String(path).replace(/^\//, '')}`,
      getManifest: () => ({ version: (window as any).__MALSYNC_PREVIEW__?.version || '0.12.5' }),
    },
    storage: {
      local: {
        get: (_keys: any, cb: (items: any) => void) => cb({}),
        set: (_items: any, cb?: () => void) => cb && cb(),
      },
    },
    i18n: {
      getMessage: (key: string) => ((window as any).i18n || {})[key] || key,
      getUILanguage: () => 'en-US',
    },
  };
  (window as any).chrome = { ...shim, ...((window as any).chrome || {}) };
}

installChromeShim();

type PreviewHandle = {
  page: pageInterface;
  pageJson: any;
  init: (fakePage: any) => void;
  runFunction: (path: string, variables?: Record<string, any>, startState?: any) => any;
  getScript: (path: string) => ChibiJson<any> | undefined;
  startProxy: () => void;
  version: string;
};

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc, part) => (acc === undefined || acc === null ? acc : acc[part]), obj);
}

async function loadPageJson() {
  const response = await fetch('/chibi/pages/Crunchyroll.json');
  return response.json();
}

let handlePromise: Promise<PreviewHandle> | null = null;

async function createHandle(): Promise<PreviewHandle> {
  const pageJson = await loadPageJson();
  const page = await Chibi();

  const runFunction: PreviewHandle['runFunction'] = (path, variables = {}, startState = null) => {
    const script = getByPath(pageJson, path);
    if (!script) throw new Error(`Chibi function not found: ${path}`);
    const consumer = new ChibiConsumer(script as ChibiJson<any>, PAGE_KEY);
    Object.keys(variables).forEach(key => consumer.addVariable(key, variables[key]));
    return consumer.run(startState);
  };

  const init: PreviewHandle['init'] = fakePage => {
    page.init(fakePage);
  };

  return {
    page,
    pageJson,
    init,
    runFunction,
    getScript: (path: string) => getByPath(pageJson, path),
    // The real extension injects `content/proxy/proxy_request.js` into the page;
    // the mock page loads the built file itself, this is just the "remote connected"
    // handshake the chibi script listens for.
    startProxy: () => {
      window.dispatchEvent(new CustomEvent('malsync-xhr-start'));
    },
    version: (window as any).__MALSYNC_PREVIEW__?.version || '0.12.5',
  };
}

const MALSyncPreview = {
  version: (window as any).__MALSYNC_PREVIEW__?.version || '0.12.5',
  pageKey: PAGE_KEY,
  async init() {
    if (!handlePromise) handlePromise = createHandle();
    return handlePromise;
  },
  /** Global chibi variables (metadataGlobal, seasonsGlobal, …) set by the page script. */
  getGlobals: () => {
    const globals: Record<string, any> = {};
    chibiRegistrySingleton.keys().forEach(key => {
      globals[key] = chibiRegistrySingleton.get(key);
    });
    return globals;
  },
  /** Runs a single chibi function from the page JSON (used by the "under the hood" view). */
  runRaw: (script: ChibiJson<any>, variables: Record<string, any> = {}, startState: any = null) => {
    const consumer = new ChibiConsumer(script, PAGE_KEY);
    Object.keys(variables).forEach(key => consumer.addVariable(key, variables[key]));
    return consumer.run(startState);
  },
  ChibiConsumer,
};

(window as any).MALSyncPreview = MALSyncPreview;

export default MALSyncPreview;
