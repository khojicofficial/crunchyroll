/**
 * Mock Crunchyroll single page app.
 *
 * Renders a watch page and a series page with the same DOM hooks the real site
 * exposes, and pulls its episode data from `/mock/crunchyroll/cms/...` through a
 * real `fetch()`. MAL-Sync's request proxy (`proxy_request.js`, loaded from the
 * actual build output) intercepts those requests exactly like on crunchyroll.com.
 */
(function () {
  const listeners = [];
  const state = { library: null, route: null, data: null };

  /**
   * Request proxy plumbing.
   *
   * `proxy_request.js` queues every request it sees until MAL-Sync signals that its
   * request listener is up ("malsync-xhr-start"), then replays the whole queue in one
   * burst. Chibi variables live on a single shared context, so a replayed burst means
   * every callback sees the *last* queued URL — the Crunchyroll CMS response would be
   * dropped. Real Crunchyroll hits this too on first load, its episode data is fetched
   * again whenever you navigate, which is why we simply re-issue the request once the
   * proxy is connected (same as clicking another episode).
   */
  let proxyConnected = false;
  let cmsRefreshed = false;
  window.addEventListener(
    'malsync-xhr-start',
    () => {
      proxyConnected = true;
      if (cmsRefreshed || !state.pendingCmsRequest) return;
      cmsRefreshed = true;
      // Fire and forget: MAL-Sync picks the response up from the proxy event.
      fetch(state.pendingCmsRequest).catch(() => {});
    },
    false,
  );

  function emit(type, detail) {
    listeners.forEach(cb => cb({ type, detail, ...state }));
  }

  function parseRoute() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // /crunchyroll/watch/<episodeId>/<slug>
    if (parts[1] === 'watch') {
      return { name: 'watch', episodeId: parts[2], slug: parts[3] };
    }
    // /crunchyroll/series/<seriesId>/<slug>
    if (parts[1] === 'series') {
      return { name: 'series', seriesId: parts[2], slug: parts[3] };
    }
    return { name: 'home' };
  }

  function findSeries(seriesId) {
    return state.library.series.find(s => s.series_id === seriesId);
  }

  function findEpisode(episodeId) {
    for (const series of state.library.series) {
      const episode = series.episodes.find(e => e.id === episodeId);
      if (episode) return { series, episode };
    }
    return null;
  }

  function episodeListHtml(series, activeEpisodeId, items) {
    return items
      .map(item => {
        const ep = item.episode;
        const current = ep.id === activeEpisodeId ? ' current' : '';
        const label = `${ep.id === activeEpisodeId ? 'Now playing' : `E${ep.episode_number}`}`;
        return `
          <div class="card${current}">
            <div class="thumb">${label}</div>
            <a href="/crunchyroll/watch/${ep.id}/${ep.slug_title}">
              <span class="playable-card__title-link">E${ep.episode_number} - ${ep.title}</span>
              <span class="card-meta">S${ep.season_number} · 24m · Sub | Dub</span>
            </a>
          </div>`;
      })
      .join('');
  }

  function nextEpisode(series, episode) {
    const all = series.episodes;
    const index = all.findIndex(e => e.id === episode.id);
    if (index >= 0 && index < all.length - 1) return all[index + 1];
    // roll over into the next season of the same series, if there is one
    const seasonIndex = series.seasons.findIndex(s => s.id === episode.season_id);
    const nextSeason = series.seasons[seasonIndex + 1];
    if (nextSeason) {
      const first = {
        id: `${nextSeason.id}-ep1`,
        slug_title: `${nextSeason.slug_title}-episode-1`,
        episode_number: 1,
      };
      return first;
    }
    return null;
  }

  async function renderWatch(route) {
    state.pendingCmsRequest = `/mock/crunchyroll/cms/objects/${route.episodeId}?locale=en-US`;
    if (!proxyConnected) cmsRefreshed = false;
    const payload = await fetch(state.pendingCmsRequest).then(r => r.json());
    const item = payload.data[0];
    const meta = item.episode_metadata;
    const found = findEpisode(route.episodeId);
    const series = found ? found.series : { series_title: meta.series_title, episodes: [] };
    const upNext = nextEpisode(series, {
      id: item.id,
      season_id: meta.season_id,
      season_number: meta.season_number,
      episode_number: meta.episode_number,
    });

    const main = document.getElementById('cr-main');
    main.innerHTML = `
      <div class="watch-hero">
        <div class="player" id="cr-player">
          <div class="poster"><div class="art">${series.series_title}</div></div>
          <button class="play" id="cr-play"><span class="material-icons">play_arrow</span></button>
          <div class="player-controls">
            <span class="material-icons">replay_10</span>
            <span class="material-icons">play_arrow</span>
            <span class="material-icons">forward_10</span>
            <span class="material-icons">volume_up</span>
            <span class="time" id="cr-time">${(meta.episode_number * 24) % 24}:12 / 24:00</span>
            <span class="material-icons">closed_caption</span>
            <span class="material-icons">settings</span>
            <span class="material-icons">fullscreen</span>
          </div>
          <div class="bar"><span></span></div>
        </div>

        <div class="upnext">
          <div class="upnext-head">
            <span class="material-icons">playlist_play</span>
            Up next
            ${
              upNext
                ? `<span data-t="next-episode"><a href="/crunchyroll/watch/${upNext.id}/${upNext.slug_title}">Next episode →</a></span>`
                : ''
            }
          </div>
          <div class="episode-list">
            ${episodeListHtml(
              series,
              item.id,
              series.episodes.map(episode => ({ episode })),
            )}
          </div>
        </div>
      </div>

      <div class="series-info">
        <div>
          <h1>${series.series_title}</h1>
          <div class="meta-row">
            <span class="pill">S${meta.season_number}</span>
            <span class="pill">E${meta.episode_number}</span>
            <span class="pill sub">Sub | Dub</span>
            <span>${meta.season_title}</span>
            <span>·</span>
            <span>Episode rating TV-14</span>
          </div>
          <div class="description"><strong>${item.title}</strong> — ${item.description}</div>
          <div class="action-row">
            <button class="btn primary"><span class="material-icons">add</span>Add to watchlist</button>
            <button class="btn"><span class="material-icons">share</span>Share</button>
            <button class="btn"><span class="material-icons">thumb_up</span>Rate</button>
          </div>
        </div>
        <div>
          <div class="upnext">
            <div class="upnext-head"><span class="material-icons">info</span>Series details</div>
            <div style="padding: 14px; color: #b9b9bd; font-size: 13px; line-height: 1.6">
              ${series.description || ''}
              <div style="margin-top: 12px">
                <a style="color: var(--cr-orange)" href="/crunchyroll/series/${series.series_id}/${series.series_slug_title}">
                  Open series page (overview scenario) →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('cr-play').addEventListener('click', () => {
      document.getElementById('cr-player').classList.add('playing');
    });

    state.data = { type: 'watch', series, episode: item };
    emit('rendered', { route, series, episode: item });
  }

  async function renderSeries(route) {
    const series = findSeries(route.seriesId);
    if (!series) throw new Error('Unknown series');
    state.pendingCmsRequest = `/mock/crunchyroll/cms/series/${route.seriesId}/seasons?locale=en-US`;
    if (!proxyConnected) cmsRefreshed = false;
    const seasonsPayload = await fetch(state.pendingCmsRequest).then(r => r.json());

    const activeSeason =
      series.seasons.find(s => s.slug_title === route.slug) ||
      series.seasons[series.seasons.length - 1];
    const episodes = series.episodes.filter(e => e.season_id === activeSeason.id);

    const main = document.getElementById('cr-main');
    main.innerHTML = `
      <link rel="alternate" hreflang="en"
        href="https://www.crunchyroll.com/series/${series.series_id}/${series.series_slug_title}" />
      <div class="top-controls">
        <span class="material-icons">arrow_back</span>
        <span class="material-icons">bookmark_border</span>
      </div>
      <div class="series-hero">
        <div class="series-poster">${series.series_title}</div>
        <div>
          <h1>${series.series_title}</h1>
          <div class="meta-row">
            <span class="pill">${seasonsPayload.data.length} seasons</span>
            <span class="pill sub">Sub | Dub</span>
            <span class="pill">TV-14</span>
          </div>
          <div class="season-info">
            <span class="material-icons">expand_more</span>
            <div class="select-trigger__title-truncated-text--mock">${activeSeason.title}</div>
            <div class="seasons-select"><span seasontitle="${activeSeason.title}"></span></div>
          </div>
          <div class="description">${series.description}</div>
          <div class="action-row">
            <button class="btn primary"><span class="material-icons">add</span>Add to watchlist</button>
            ${
              series.seasons
                .map(
                  s =>
                    `<a class="btn" href="/crunchyroll/series/${series.series_id}/${s.slug_title}">${s.title}</a>`,
                )
                .join('')
            }
          </div>
        </div>
      </div>
      <div class="episode-list series-episodes">
        ${episodeListHtml(
          series,
          null,
          episodes.map(episode => ({ episode })),
        )}
      </div>
    `;

    state.data = { type: 'series', series, season: activeSeason, seasonsPayload };
    emit('rendered', { route, series, season: activeSeason });
  }

  async function renderHome() {
    const main = document.getElementById('cr-main');
    main.innerHTML = `
      <div class="series-hero" style="margin-top: 30px">
        <div>
          <h1>Crunchyroll preview</h1>
          <div class="description">
            Pick a watch page or series page to load it into the mock site. Every URL below is a
            real Crunchyroll URL shape, and MAL-Sync's detection runs against the page you load.
          </div>
          <div class="action-row">
            ${state.library.series
              .map(
                s => `
              <a class="btn" href="/crunchyroll/series/${s.series_id}/${s.series_slug_title}">${s.series_title}</a>
            `,
              )
              .join('')}
          </div>
          <div style="margin-top: 22px" class="description">Watch pages:</div>
          <div class="action-row">
            ${state.library.series
              .flatMap(s => s.episodes.map(e => ({ s, e })))
              .map(
                ({ s, e }) =>
                  `<a class="btn" href="/crunchyroll/watch/${e.id}/${e.slug_title}">${s.series_title} · E${e.episode_number}</a>`,
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
    state.data = { type: 'home' };
    emit('rendered', { route: { name: 'home' } });
  }

  async function render() {
    const route = parseRoute();
    state.route = route;
    try {
      if (route.name === 'watch') await renderWatch(route);
      else if (route.name === 'series') await renderSeries(route);
      else await renderHome();
    } catch (e) {
      document.getElementById('cr-main').innerHTML = `<div class="loading">Failed to render: ${e.message}</div>`;
      emit('error', e);
    }
    window.scrollTo({ top: 0 });
  }

  /** Client side navigation, so MAL-Sync's detectURLChanges() can pick it up. */
  function navigate(href) {
    window.history.pushState({}, '', href);
    render();
  }

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || !href.startsWith('/crunchyroll')) return;
    event.preventDefault();
    navigate(href);
  });

  window.addEventListener('popstate', render);

  window.MockCrunchyroll = {
    get library() {
      return state.library;
    },
    get route() {
      return state.route;
    },
    onEvent: cb => listeners.push(cb),
    navigate,
    findSeries,
    findEpisode,
  };

  (async function boot() {
    state.library = await fetch('/mock/crunchyroll/library.json').then(r => r.json());
    emit('library', state.library);
    await render();
    window.MockCrunchyroll.ready = true;
    emit('ready', state);
  })();
})();
