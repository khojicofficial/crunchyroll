/**
 * Mock of `src/api/webextension.ts` for the local preview.
 *
 * The real chibi page code talks to the extension background through the `api`
 * global (provided via webpack ProvidePlugin). In this preview there is no
 * background service worker, so requests are served by the local dev server
 * (`/chibi/*` is mapped to the build output in `dist/webextension/chibi`).
 */

declare let chrome: any;

const storageData: Record<string, any> = {};

const defaults: Record<string, any> = {
  // The Crunchyroll chibi page matches `*://*.crunchyroll.com/*`. The preview runs
  // on localhost, so we hand it in through MALSync's real "custom domains" feature.
  customDomains: [
    {
      page: 'Crunchyroll',
      domain: '*://*/*',
      auto: false,
    },
  ],
  chibiRepos: [],
  syncMode: 'MAL',
  localSync: true,
};

export const settingsStore: Record<string, any> = { ...defaults };

export const storage = {
  version: () => (window as any).__MALSYNC_PREVIEW__?.version || '0.12.5',

  async get(key: string) {
    return storageData[key];
  },

  async set(key: string, value: any) {
    storageData[key] = value;
  },

  async remove(key: string) {
    delete storageData[key];
  },

  async list() {
    return { ...storageData };
  },

  async addStyle(css: string) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  },

  version_() {
    return '0.12.5';
  },

  lang(selector: string, args?: any[]) {
    const messages = (window as any).i18n || {};
    let message = messages[selector] || selector;
    if (typeof args !== 'undefined') {
      args.forEach((arg, i) => {
        message = message.replace(`$${i + 1}`, arg);
      });
    }
    return message;
  },

  langDirection: () => 'ltr',
  assetUrl: (filename: string) => `/assets/${filename}`,
  injectCssResource: () => undefined,
  injectjsResource: () => undefined,
  addProxyScriptToTag: (tag: any) => tag,
  updateDom: () => undefined,
  storageOnChanged: () => undefined,
};

export const request = {
  /**
   * Fake XHR. `source: 'preview'` keeps the log clean and makes it obvious in the
   * console that these requests never left the sandbox.
   */
  async xhr(method: string, url: string) {
    const response = await fetch(url, { method });
    const responseText = await response.text();
    return {
      finalUrl: url,
      responseText,
      status: response.status,
    };
  },
};

export const settings = {
  get(key: string) {
    return settingsStore[key];
  },
  async set(key: string, value: any) {
    settingsStore[key] = value;
    return true;
  },
  async getAsync(key: string) {
    return settingsStore[key];
  },
  async init() {
    return undefined;
  },
};

export const type = 'webextension';

export const PreviewApiStub = { storage, request, settings, type };
