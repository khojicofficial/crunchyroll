/**
 * chrome.* shim for the extension popup preview.
 *
 * The popup bundle is the real `dist/webextension/content/popup.js`; in this sandbox
 * there is no extension background, so this file implements the small part of the
 * extension API the popup touches and answers the background messages with local
 * fixture data (`/mock/mal/*`).
 */
(function () {
  const previewMeta = window.__MALSYNC_PREVIEW__ || {};
  const VERSION = previewMeta.version || '0.12.5';

  // Settings live in `sync` storage (that is what the extension uses), local holds the
  // rest (caches, progress, …).
  const settings = {
    malToken: 'preview-token',
    malRefresh: 'preview-refresh',
    syncMode: 'MAL',
    // Prefer English titles, like most users have configured.
    forceEnglishTitles: true,
    bookMarksList: false,
    bookMarksListManga: false,
    customDomains: [],
    chibiRepos: [],
  };

  const data = {
    sync: Object.fromEntries(Object.entries(settings).map(([key, value]) => [`settings/${key}`, value])),
    local: {},
  };

  const listeners = { local: [], sync: [] };

  /**
   * Most chrome.* methods are dual API: a callback when one is passed, a promise
   * otherwise (the popup uses both styles).
   */
  function api(fn) {
    return function (...args) {
      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      return new Promise(resolve => {
        fn(...args, result => {
          if (callback) callback(result);
          resolve(result);
        });
      });
    };
  }

  function makeArea(name) {
    const store = data[name];
    return {
      get: api((keys, done) => {
        const result = {};
        if (keys === null || keys === undefined) {
          Object.assign(result, store);
        } else if (typeof keys === 'string') {
          if (keys in store) result[keys] = store[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (key in store) result[key] = store[key];
          });
        } else {
          Object.keys(keys).forEach(key => {
            result[key] = key in store ? store[key] : keys[key];
          });
        }
        setTimeout(() => done(result), 0);
      }),
      set: api((items, done) => {
        const changes = {};
        Object.keys(items).forEach(key => {
          changes[key] = { oldValue: store[key], newValue: items[key] };
          store[key] = items[key];
        });
        listeners[name].forEach(listener => {
          setTimeout(() => listener(changes, name), 0);
        });
        setTimeout(done, 0);
      }),
      remove: api((keys, done) => {
        (Array.isArray(keys) ? keys : [keys]).forEach(key => {
          delete store[key];
        });
        setTimeout(done, 0);
      }),
      clear: api(done => {
        Object.keys(store).forEach(key => {
          delete store[key];
        });
        setTimeout(done, 0);
      }),
    };
  }

  function manifest() {
    return (
      window.__MALSYNC_MANIFEST__ || {
        version: VERSION,
        name: 'MAL-Sync (preview)',
        permissions: ['storage'],
        host_permissions: [],
      }
    );
  }

  function messages() {
    try {
      // `i18n.js` from the build output declares a top level `const i18n`.
      return typeof i18n !== 'undefined' ? i18n : {};
    } catch (error) {
      return {};
    }
  }

  function getUrl(path) {
    const clean = String(path).replace(/^\/?popup\//, '').replace(/^\//, '');
    // Build artefacts (chibi pages, vendor assets) are served from their real routes so
    // the extension can load them exactly like it does from the extension root.
    const root = /^chibi\//.test(clean) ? '/chibi/' : '/popup/';
    return new URL(clean.replace(/^chibi\//, ''), `${window.location.origin}${root}`).href;
  }

  async function proxyRequest(message) {
    const url = typeof message.url === 'string' ? message.url : message.url?.url || '';
    const parsed = new URL(url, window.location.origin);
    const status = parsed.searchParams.get('status');

    if (/\/users\/@me\/animelist$/.test(parsed.pathname)) {
      const payload = await fetch('/mock/mal/animelist.json').then(r => r.json());
      payload.data = payload.data.filter(entry =>
        status ? entry.list_status.status === status : true,
      );
      return { status: 200, finalUrl: url, responseText: JSON.stringify(payload) };
    }

    if (/\/users\/@me\/mangalist$/.test(parsed.pathname)) {
      const payload = await fetch('/mock/mal/mangalist.json').then(r => r.json());
      return { status: 200, finalUrl: url, responseText: JSON.stringify(payload) };
    }

    if (/\/users\/@me$/.test(parsed.pathname)) {
      const text = await fetch('/mock/mal/user.json').then(r => r.text());
      return { status: 200, finalUrl: url, responseText: text };
    }

    // Chibi pages are part of the build output and are served for real.
    if (/\/chibi\//.test(parsed.pathname)) {
      const file = '/' + parsed.pathname.split('/chibi/')[1];
      const response = await fetch(`/chibi/${file}`).catch(() => null);
      if (response && response.ok) {
        return { status: 200, finalUrl: url, responseText: await response.text() };
      }
    }

    // Anything else is not mocked in the preview: report it as a normal API error so
    // the UI shows its regular error state instead of pretending to have data.
    console.log('[preview] unmocked background xhr:', message.method, url);
    return {
      status: 404,
      finalUrl: url,
      responseText: JSON.stringify({ error: 'not_mocked', message: `preview has no fixture for ${url}` }),
    };
  }

  async function handleMessage(message) {
    if (!message || typeof message !== 'object') return undefined;
    switch (message.name) {
      case 'xhr':
        return proxyRequest(message);
      case 'database':
        return { data: [] };
      case 'notification':
        return undefined;
      case 'minimalWindow':
        return undefined;
      case 'content':
        return undefined;
      default:
        console.log('[preview] unhandled background message:', message.name);
        return undefined;
    }
  }

  window.chrome = {
    runtime: {
      lastError: null,
      id: 'preview',
      getManifest: manifest,
      getURL: getUrl,
      sendMessage: api((message, done) => {
        handleMessage(message).then(done, error => {
          console.log('[preview] background message failed', error);
          done(undefined);
        });
      }),
      onMessage: {
        addListener() {},
        removeListener() {},
        hasListener: () => false,
      },
      onInstalled: { addListener() {} },
      connect: () => ({ onMessage: { addListener() {} }, postMessage() {}, disconnect() {} }),
    },
    storage: {
      local: makeArea('local'),
      sync: makeArea('sync'),
      onChanged: {
        addListener(listener) {
          listeners.local.push(listener);
          listeners.sync.push(listener);
        },
        removeListener() {},
      },
      session: makeArea('local'),
    },
    i18n: {
      getMessage(key, args) {
        let message = messages()[key];
        if (typeof message !== 'string') return '';
        if (args !== undefined) {
          (Array.isArray(args) ? args : [args]).forEach((arg, index) => {
            message = message.replace(`$${index + 1}`, arg);
          });
        }
        return message;
      },
      getUILanguage: () => 'en-US',
    },
    tabs: {
      query: api((_query, done) => setTimeout(() => done([]), 0)),
      sendMessage: api((_tabId, _message, done) => {
        // Page fill is disabled in the preview: the popup stays on its bookmarks view.
        setTimeout(() => done(undefined), 0);
      }),
    },
    permissions: {
      // Everything is "granted" in the preview, the extension is served from its own
      // origin so no permission prompts can be shown.
      contains: api((_permissions, done) => setTimeout(() => done(true), 0)),
      request: api((_permissions, done) => setTimeout(() => done(true), 0)),
      remove: api((_permissions, done) => setTimeout(() => done(true), 0)),
      getAll: api(done =>
        setTimeout(
          () =>
            done({
              permissions: manifest().permissions || [],
              origins: manifest().host_permissions || [],
            }),
          0,
        ),
      ),
      onAdded: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    notifications: {
      create: api((_id, _options, done) => setTimeout(() => done('preview'), 0)),
    },
    browserAction: { setBadgeText() {}, setIcon() {} },
    action: { setBadgeText() {}, setIcon() {} },
  };
})();
