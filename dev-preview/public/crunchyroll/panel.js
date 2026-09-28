/**
 * MAL-Sync preview panel.
 *
 * Drives the real chibi page object (loaded by /build/harness.js) inside the mock
 * Crunchyroll page and visualises what the extension would detect and sync.
 * Everything tagged "real chibi script" executes the compiled page JSON; only the
 * MyAnimeList side of the sync card is simulated.
 */
(function () {
  const $ = id => document.getElementById(id);
  const MAX_LOG = 250;

  let handle = null;
  let page = null;
  let listElements = [];
  let lastResult = null;

  // ---------------------------------------------------------------- logging
  function pushLog(kind, message) {
    const stream = $('log-stream');
    if (!stream) return;
    const entry = document.createElement('div');
    entry.className = `entry ${kind}`;
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    entry.innerHTML = `<span class="time">${time}</span><span class="msg"></span>`;
    entry.querySelector('.msg').textContent = message;
    stream.appendChild(entry);
    while (stream.children.length > MAX_LOG) stream.removeChild(stream.firstChild);
    stream.scrollTop = stream.scrollHeight;
  }

  function formatArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message;
    try {
      const json = JSON.stringify(arg);
      return json === undefined ? String(arg) : json.length > 400 ? `${json.slice(0, 400)}…` : json;
    } catch {
      return String(arg);
    }
  }

  /** MAL-Sync logs through `con.*`, which prefixes everything with "%cMAL-Sync". */
  function installConsoleHook() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        original(...args);
        if (typeof args[0] !== 'string' || !args[0].includes('%cMAL-Sync')) return;
        const rest = args.slice(1).filter(a => typeof a !== 'string' || !a.includes('background-color:'));
        const kind = level === 'error' ? 'error' : level === 'info' ? 'info' : 'panel';
        pushLog(kind, rest.map(formatArg).join(' '));
      };
    });
  }

  // ------------------------------------------------------------- detection
  const SYNC_TESTS = [
    { path: 'sync.isSyncPage', label: 'isSyncPage()', run: p => p.isSyncPage(location.href) },
    { path: 'sync.getTitle', label: 'getTitle()', run: p => p.sync.getTitle(location.href) },
    { path: 'sync.getEpisode', label: 'getEpisode()', run: p => p.sync.getEpisode(location.href) },
    {
      path: 'sync.getIdentifier',
      label: 'getIdentifier()',
      run: p => p.sync.getIdentifier(location.href),
    },
    {
      path: 'sync.getOverviewUrl',
      label: 'getOverviewUrl()',
      run: p => p.sync.getOverviewUrl(location.href),
    },
    {
      path: 'sync.nextEpUrl',
      label: 'nextEpUrl()',
      run: p => (p.sync.nextEpUrl ? p.sync.nextEpUrl(location.href) : undefined),
    },
  ];

  const OVERVIEW_TESTS = [
    {
      path: 'overview.isOverviewPage',
      label: 'isOverviewPage()',
      run: p => (p.isOverviewPage ? p.isOverviewPage(location.href) : undefined),
    },
    {
      path: 'overview.getTitle',
      label: 'getTitle()',
      run: p => (p.overview ? p.overview.getTitle(location.href) : undefined),
    },
    {
      path: 'overview.getIdentifier',
      label: 'getIdentifier()',
      run: p => (p.overview ? p.overview.getIdentifier(location.href) : undefined),
    },
  ];

  function runTest(test) {
    try {
      return { value: test.run(page), error: null };
    } catch (error) {
      return { value: undefined, error: error.message };
    }
  }

  function renderRows(container, tests, results) {
    container.innerHTML = '';
    tests.forEach(test => {
      const result = results[test.path];
      const row = document.createElement('div');
      row.className = 'row';

      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = test.label;

      const value = document.createElement('span');
      const formatted =
        result.error !== null
          ? `⚠ ${result.error}`
          : result.value === undefined
            ? 'undefined'
            : formatArg(result.value);
      value.className =
        'value' +
        (result.error ? ' false' : result.value === undefined || result.value === '' || result.value === null ? ' empty' : '') +
        (result.value === true ? ' true' : result.value === false ? ' false' : '');
      value.textContent = formatted;

      const button = document.createElement('button');
      button.className = 'icon';
      button.title = 'Show the compiled chibi script';
      button.innerHTML = '<span class="material-icons">code</span>';
      button.addEventListener('click', () => showScript(test.path));

      row.append(key, value, button);
      container.appendChild(row);
    });
  }

  function setStatus(kind, title, detail) {
    const card = $('status-card');
    card.className = `status-card ${kind}`;
    const icon = kind === 'ok' ? 'check_circle' : kind === 'fail' ? 'error' : 'progress_activity';
    card.innerHTML = `<span class="material-icons ${kind === 'pending' ? 'spinner' : ''}">${icon}</span>
      <span>${title}${detail ? `<small>${detail}</small>` : ''}</span>`;
  }

  // ------------------------------------------------------------ list table
  function detectList() {
    const container = $('list-table');
    container.innerHTML = '';
    listElements = [];

    if (!page || !page.overview || !page.overview.list) {
      container.innerHTML = '<div class="empty">No list on this page.</div>';
      return;
    }

    let elements;
    try {
      elements = page.overview.list.elementsSelector();
    } catch (error) {
      container.innerHTML = `<div class="empty">elementsSelector() failed: ${error.message}</div>`;
      return;
    }

    if (!elements || !elements.length) {
      container.innerHTML = '<div class="empty">elementsSelector() matched 0 elements.</div>';
      return;
    }

    elements.each((index, element) => {
      if (index > 11) return;
      listElements.push(element);
      let url = '';
      let ep = '';
      try {
        url = page.overview.list.elementUrl(element) || '';
      } catch (error) {
        url = `⚠ ${error.message}`;
      }
      try {
        ep = page.overview.list.elementEp(element);
      } catch (error) {
        ep = `⚠ ${error.message}`;
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="key">#${index + 1}</span><span class="value"></span><span></span>`;
      row.querySelector('.value').innerHTML = `<b>E${ep}</b> · ${url.replace(/^https?:\/\/[^/]+/, '')}`;
      container.appendChild(row);
    });

    pushLog('panel', `list.elementsSelector() matched ${elements.length} episode card(s)`);
  }

  // ------------------------------------------------------------ sync card
  const MAL_DB = {
    'solo-leveling': { id: 52299, title: 'Solo Leveling', eps: 12 },
    'rezero-starting-life-in-another-world': {
      id: 31240,
      title: 'Re:ZERO -Starting Life in Another World-',
      eps: 25,
    },
    'frieren-beyond-journeys-end': { id: 52991, title: "Frieren: Beyond Journey's End", eps: 28 },
    'attack-on-titan': { id: 16498, title: 'Shingeki no Kyojin', eps: 25 },
    'attack-on-titan-final-season': { id: 40028, title: 'Shingeki no Kyojin: The Final Season', eps: 16 },
  };

  const COVER_COLORS = [
    'linear-gradient(160deg, #35406b, #131726)',
    'linear-gradient(160deg, #6b3540, #261317)',
    'linear-gradient(160deg, #3a6b35, #132613)',
    'linear-gradient(160deg, #6b5c35, #262013)',
    'linear-gradient(160deg, #5a356b, #1f1326)',
  ];

  function simulatedSearch(identifier, title) {
    const slug = (identifier || '').split('|')[1] || '';
    const keys = Object.keys(MAL_DB);
    const key = keys.find(k => slug === k || (slug && slug.startsWith(k))) || null;
    if (key) return { key, ...MAL_DB[key] };
    if (title) {
      const match = keys.find(k => MAL_DB[k].title.toLowerCase().startsWith(title.toLowerCase().slice(0, 6)));
      if (match) return { key: match, ...MAL_DB[match] };
    }
    return null;
  }

  function renderSyncCard(result) {
    const card = $('sync-card');
    const title = result['sync.getTitle'] && result['sync.getTitle'].value;
    const episode = result['sync.getEpisode'] && result['sync.getEpisode'].value;
    const identifier = result['sync.getIdentifier'] && result['sync.getIdentifier'].value;

    if (!title || !episode) {
      card.innerHTML = `<div class="sync-empty">Waiting for the Crunchyroll CMS response to populate
        <code>metadataGlobal</code>… the chibi script sets it from the intercepted request.</div>`;
      return;
    }

    const match = simulatedSearch(identifier, title);
    const colorIndex = (String(identifier).length + Number(episode)) % COVER_COLORS.length;
    const totalEps = match ? match.eps : 12;
    const percent = Math.min(100, Math.round((Number(episode) / totalEps) * 100));

    card.innerHTML = `
      <div class="sync-anime">
        <div class="cover" style="background: ${COVER_COLORS[colorIndex]}">
          ${(match ? match.title : title).slice(0, 34)}
        </div>
        <div style="flex: 1; min-width: 0">
          <div class="sync-title">${match ? match.title : title}</div>
          <div class="sync-meta">
            ${match ? `MyAnimeList #${match.id} · matched from the detected title` : 'No simulated MyAnimeList match'} <br />
            Progress <b>${episode} / ${totalEps}</b> · status <b>Watching</b><br />
            identifier <code>${identifier}</code>
          </div>
          <div class="sync-progress"><span style="width: ${percent}%"></span></div>
          <div class="sync-meta">${percent}% of the detected episode count</div>
        </div>
      </div>
      <div class="sync-actions">
        <button id="sync-do"><span class="material-icons">sync</span>Sync episode ${episode}</button>
        <button class="ghost" id="sync-next">Next episode</button>
      </div>
      <p class="hint" style="margin-top: 10px">
        The MyAnimeList lookup and the sync itself are simulated — the title and episode above are
        parsed from the page by the real Crunchyroll chibi script.
      </p>
    `;

    $('sync-do').addEventListener('click', () => {
      pushLog('event', `SIMULATED sync → MyAnimeList: "${match ? match.title : title}" episode ${episode}`);
    });
    $('sync-next').addEventListener('click', () => {
      const next = lastResult && lastResult['sync.nextEpUrl'] ? lastResult['sync.nextEpUrl'].value : null;
      if (next) {
        pushLog('event', `nextEpUrl() → navigating to ${next}`);
        MockCrunchyroll.navigate(new URL(next).pathname);
      } else {
        pushLog('error', 'nextEpUrl() returned nothing on this page');
      }
    });
  }

  // ------------------------------------------------------------- detection
  function detect(reason) {
    if (!page) return;
    const isSync = page.isSyncPage(location.href);
    const isOverview = page.isOverviewPage ? page.isOverviewPage(location.href) : false;

    const tests = (isSync ? SYNC_TESTS : isOverview ? OVERVIEW_TESTS : []).concat(
      isSync ? OVERVIEW_TESTS.slice(0, 1) : [],
    );
    const results = {};
    tests.forEach(test => {
      results[test.path] = runTest(test);
    });
    lastResult = results;

    renderRows($('detection-table'), tests, results);
    renderSyncCard(results);
    detectList();

    const routeLabel = isSync ? 'sync page (episode)' : isOverview ? 'overview page (series)' : 'unknown page';
    setStatus(
      isSync || isOverview ? 'ok' : 'fail',
      `Recognised as: ${routeLabel}`,
      `${location.pathname} · re-checked because of ${reason}`,
    );

    const title = results['sync.getTitle'] && results['sync.getTitle'].value;
    const episode = results['sync.getEpisode'] && results['sync.getEpisode'].value;
    if (isSync && title && episode) {
      pushLog('panel', `detected "${title}" episode ${episode}`);
    }
  }

  // ------------------------------------------------------- under the hood
  const FN_ORDER = [
    'sync.isSyncPage',
    'sync.getTitle',
    'sync.getEpisode',
    'sync.getIdentifier',
    'sync.getOverviewUrl',
    'sync.nextEpUrl',
    'list.elementsSelector',
    'list.elementUrl',
    'list.elementEp',
    'overview.isOverviewPage',
    'overview.getTitle',
    'overview.getIdentifier',
    'overview.uiInjection',
    'lifecycle.setup',
    'lifecycle.ready',
  ];

  function buildFnSelect() {
    const select = $('fn-select');
    select.innerHTML = '';
    FN_ORDER.forEach(path => {
      const script = handle.getScript(path);
      if (!script) return;
      const option = document.createElement('option');
      option.value = path;
      option.textContent = script.length ? path : `${path} (empty)`;
      select.appendChild(option);
    });
    select.value = 'sync.getTitle';
    showScript(select.value);
    select.addEventListener('change', () => showScript(select.value));
    $('fn-run').addEventListener('click', runSelected);
  }

  function showScript(path) {
    const select = $('fn-select');
    if (select && path) select.value = path;
    if (!handle) return;
    const script = handle.getScript(path || select.value);
    $('fn-json').textContent = script
      ? JSON.stringify(script, null, 1)
      : `// no "${path}" function in the Crunchyroll page JSON`;
    if (!document.getElementById('section-under').classList.contains('highlight')) {
      document.getElementById('section-under').classList.add('highlight');
      setTimeout(() => document.getElementById('section-under').classList.remove('highlight'), 600);
    }
  }

  function runSelected() {
    const path = $('fn-select').value;
    const script = handle.getScript(path);
    const variables = { url: location.href };
    if (path === 'sync.uiInjection' || path === 'overview.uiInjection') variables.ui = '<div>PREVIEW-UI</div>';
    if (path.startsWith('list.')) variables.element = listElements[0];

    pushLog('event', `running ${path} …`);
    try {
      const value = MALSyncPreview.runRaw(script, variables, path.startsWith('list.') ? variables.element : null);
      pushLog('panel', `${path} → ${formatArg(value)}`);
    } catch (error) {
      pushLog('error', `${path} threw: ${error.message}`);
    }
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    installConsoleHook();

    const meta = window.__MALSYNC_PREVIEW__ || {};
    $('panel-version').textContent = `v${meta.version || '?'} · ${meta.commit || 'unknown'}`;
    $('footer-version').textContent = `v${meta.version || ''} (${meta.commit || ''})`;

    $('panel-toggle').addEventListener('click', () => $('malsync-panel').classList.toggle('collapsed'));
    $('panel-close').addEventListener('click', () => $('malsync-panel').classList.add('collapsed'));
    $('panel-rerun').addEventListener('click', () => detect('manual re-run'));
    $('log-clear').addEventListener('click', () => {
      $('log-stream').innerHTML = '';
    });

    pushLog('panel', 'Preview panel ready — booting the compiled Crunchyroll chibi page …');

    try {
      handle = await MALSyncPreview.init();
      page = handle.page;
      pushLog(
        'panel',
        `Chibi page loaded: ${page.name} · type ${page.type} · languages ${page.languages.join(', ')}`,
      );
      pushLog('panel', `urls.match ${JSON.stringify(handle.pageJson.urls.match)} → matched via customDomains`);

      const fakePage = {
        novel: false,
        reset() {
          pushLog('event', 'SyncPage.reset() — trigger fired');
        },
        handlePage() {
          detect('trigger() from the chibi script');
        },
        handleList() {
          detectList();
        },
      };

      handle.init(fakePage);
      pushLog('panel', 'lifecycle.setup() ran → Crunchyroll style.less injected');
      pushLog(
        'panel',
        'lifecycle.ready() ran → requestProxy() listening, detectChanges() watching the URL',
      );

      buildFnSelect();
      detect('initial check');

      // The chibi lifecycle only re-runs the page check when the script calls
      // trigger() (Crunchyroll does that for episode metadata and URL changes). The
      // overview page has no trigger, so the panel re-checks whenever a chibi global
      // (metadataGlobal / seasonsGlobal) shows up or changes.
      let globalFingerprint = '';
      setInterval(() => {
        const globals = MALSyncPreview.getGlobals();
        const fingerprint = Object.keys(globals)
          .map(key => `${key}:${JSON.stringify(globals[key])?.length || 0}`)
          .join('|');
        if (fingerprint !== globalFingerprint) {
          globalFingerprint = fingerprint;
          if (fingerprint) detect('chibi global update');
        }
      }, 400);
    } catch (error) {
      setStatus('fail', 'Could not boot the chibi runtime', error.message);
      pushLog('error', `chibi boot failed: ${error.message}`);
      return;
    }

    MockCrunchyroll.onEvent(event => {
      if (event.type === 'rendered') {
        setTimeout(() => detect('page rendered'), 200);
      }
    });

    // The mock site renders before this panel boots, so catch that case too.
    if (!MockCrunchyroll.ready) {
      const wait = setInterval(() => {
        if (MockCrunchyroll.ready) {
          clearInterval(wait);
          detect('page rendered');
        }
      }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
