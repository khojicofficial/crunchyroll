/*!
 * CrunchyrollPlayer 1.0.0
 *
 * A dependency-free, Crunchyroll-styled video player shell (controls, timeline, captions,
 * settings, fullscreen, keyboard shortcuts). It works in two modes:
 *
 *   CrunchyrollPlayer.create(root, options)             simulated playback (demo / preview)
 *   CrunchyrollPlayer.attachVideo(root, videoElement)   drives a real <video> element
 *
 * Extracted from the MAL-Sync dev preview (dev-preview/), where it stands in for the
 * Crunchyroll watch page player. MAL-Sync itself is GPL-3.0-only, and so is this file.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    replay10:
      '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="9" y="21" font-size="7" font-family="sans-serif">10</text></svg>',
    forward10:
      '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="7" y="21" font-size="7" font-family="sans-serif">10</text></svg>',
    volume:
      '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    muted:
      '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm18.5 3-2.1-2.1-1.4 1.4L20.1 13l-2.1 2.1 1.4 1.4L21.5 14.4 23.6 16.5l1.4-1.4L22.9 13l2.1-2.1-1.4-1.4-2.1 2.1z"/></svg>',
    captions:
      '<svg viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM11 11H9.5v-.5h-2v3h2V13H11v1.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V11zm7 0h-1.5v-.5h-2v3h2V13H18v1.5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V11z"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.8 7.8 0 0 0 .1-1 7.8 7.8 0 0 0-.1-1l2.1-1.6a.5.5 0 0 0 .1-.7l-2-3.4a.5.5 0 0 0-.6-.2l-2.5 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.4a.5.5 0 0 0 .1.7L4.5 11a7.8 7.8 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.7l2 3.4c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .3.2.4.5.4h4c.3 0 .5-.1.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.4a.5.5 0 0 0-.1-.7L19.4 13zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>',
    fullscreen:
      '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    exitFullscreen:
      '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
  };

  const DEFAULTS = {
    title: 'Untitled',
    subtitle: '',
    /** Anything CSS accepts for `background` — a gradient, a url(…), a colour. */
    poster: 'linear-gradient(135deg, #1b2138 0%, #0e1017 60%)',
    duration: 24 * 60,
    startAt: 0,
    rate: 1,
    muted: false,
    captions: true,
    captionsTrack: [],
    hideControlsDelay: 3000,
    idleAfter: 3000,
    labels: {
      play: 'Play',
      pause: 'Pause',
      replay10: 'Rewind 10 seconds',
      forward10: 'Forward 10 seconds',
      mute: 'Mute',
      unmute: 'Unmute',
      captions: 'Subtitles',
      settings: 'Settings',
      fullscreen: 'Fullscreen',
      playEpisode: 'Play episode',
    },
  };

  function merge(base, extra) {
    const out = {};
    Object.keys(base).forEach(key => {
      out[key] = extra && key in extra ? extra[key] : base[key];
    });
    if (extra) Object.keys(extra).forEach(key => (out[key] = extra[key]));
    return out;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    const pad = value => String(value).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /** The simulated clock used when the player is not bound to a real <video>. */
  function simulatedSource(options) {
    let time = options.startAt || 0;
    let duration = options.duration;
    let rate = options.rate;
    let muted = options.muted;
    let timer = null;
    let last = 0;
    const api = {
      isReal: false,
      onTick: null,
      onEnded: null,
      getDuration: () => duration,
      setDuration: value => {
        duration = value;
      },
      getTime: () => time,
      seek: value => {
        time = Math.min(Math.max(0, value), duration);
      },
      setRate: value => {
        rate = value;
      },
      getRate: () => rate,
      isMuted: () => muted,
      setMuted: value => {
        muted = value;
      },
      play: () => {
        if (timer) return;
        last = Date.now();
        timer = setInterval(() => {
          const now = Date.now();
          time = Math.min(duration, time + ((now - last) / 1000) * rate);
          last = now;
          if (api.onTick) api.onTick(time);
          if (time >= duration) {
            api.pause();
            if (api.onEnded) api.onEnded();
          }
        }, 100);
      },
      pause: () => {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
      },
      destroy: () => {
        api.pause();
      },
    };
    return api;
  }

  /** Adapter around a real <video> element. */
  function mediaSource(video) {
    return {
      isReal: true,
      getDuration: () => video.duration || 0,
      setDuration: () => {},
      getTime: () => video.currentTime || 0,
      seek: value => {
        video.currentTime = Math.min(Math.max(0, value), video.duration || value);
      },
      setRate: value => {
        video.playbackRate = value;
      },
      getRate: () => video.playbackRate,
      isMuted: () => video.muted,
      setMuted: value => {
        video.muted = value;
      },
      play: () => video.play(),
      pause: () => video.pause(),
      destroy: () => {},
      onTick: null,
      onEnded: null,
    };
  }

  function create(rootOrSelector, userOptions) {
    const root =
      typeof rootOrSelector === 'string'
        ? document.querySelector(rootOrSelector)
        : rootOrSelector;
    if (!root) throw new Error('CrunchyrollPlayer: container element not found');

    const options = merge(DEFAULTS, userOptions);
    const source =
      options.video instanceof HTMLVideoElement
        ? mediaSource(options.video)
        : options.video && options.video.tagName === 'VIDEO'
          ? mediaSource(options.video)
          : simulatedSource(options);
    if (options.video) root.classList.add('crp--media');

    const labels = options.labels;
    let captionsOn = !!options.captions;
    let destroyed = false;
    let idleTimer = null;
    let dragging = false;

    root.classList.add('crp', 'crp--paused');
    root.setAttribute('tabindex', '0');
    root.setAttribute('role', 'region');
    if (options.title) root.setAttribute('aria-label', options.title);

    root.innerHTML = `
      <div class="crp__stage" data-t="stage">
        <div class="crp__poster" data-t="poster">
          <span class="crp__poster-title" data-t="poster-title"></span>
        </div>
        <div class="crp__captions" data-t="captions" hidden></div>
        <button class="crp__center" data-t="center" type="button" aria-label="${labels.playEpisode}">
          <span class="crp__center-icon">${ICONS.play}</span>
        </button>
        <div class="crp__gradient"></div>
        <div class="crp__controls" data-t="controls">
          <div class="crp__progress" data-t="progress" role="slider"
               aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="-1">
            <div class="crp__progress-track"><div class="crp__progress-played" data-t="played"></div></div>
            <div class="crp__progress-thumb" data-t="thumb"></div>
          </div>
          <div class="crp__row">
            <button class="crp__btn" type="button" data-t="replay10" aria-label="${labels.replay10}">${ICONS.replay10}</button>
            <button class="crp__btn" type="button" data-t="toggle" aria-label="${labels.play}">${ICONS.play}</button>
            <button class="crp__btn" type="button" data-t="forward10" aria-label="${labels.forward10}">${ICONS.forward10}</button>
            <button class="crp__btn" type="button" data-t="mute" aria-label="${labels.mute}">${ICONS.volume}</button>
            <span class="crp__time" data-t="time">0:00 / 0:00</span>
            <span class="crp__spacer"></span>
            <button class="crp__btn" type="button" data-t="captions" aria-label="${labels.captions}">${ICONS.captions}</button>
            <button class="crp__btn" type="button" data-t="settings" aria-label="${labels.settings}">${ICONS.settings}</button>
            <button class="crp__btn" type="button" data-t="fullscreen" aria-label="${labels.fullscreen}">${ICONS.fullscreen}</button>
          </div>
        </div>
        <div class="crp__menu" data-t="menu" hidden>
          <div class="crp__menu-title">Playback speed</div>
          <div class="crp__menu-options" data-t="rates"></div>
          <button class="crp__menu-close" type="button" data-t="menu-close">Close</button>
        </div>
      </div>
    `;

    const node = name => root.querySelector(`[data-t="${name}"]`);
    const stage = node('stage');
    const poster = node('poster');
    const posterTitle = node('poster-title');
    const captionBox = node('captions');
    const center = node('center');
    const toggle = node('toggle');
    const mute = node('mute');
    const captionsBtn = node('captions');
    const settingsBtn = node('settings');
    const fullscreenBtn = node('fullscreen');
    const menu = node('menu');
    const timeLabel = node('time');
    const played = node('played');
    const thumb = node('thumb');
    const progress = node('progress');

    const rates = [0.5, 1, 1.25, 1.5, 2];
    node('rates').innerHTML = rates
      .map(
        rate =>
          `<button class="crp__rate${rate === source.getRate() ? ' is-active' : ''}" type="button" data-rate="${rate}">${rate}×</button>`,
      )
      .join('');

    function emit(name, detail) {
      root.dispatchEvent(
        new CustomEvent(`crp:${name}`, { detail, bubbles: false, cancelable: false }),
      );
    }

    function isPaused() {
      return root.classList.contains('crp--paused');
    }

    function setPoster(value) {
      poster.style.background = value;
    }

    function setMeta(meta) {
      if (meta.title !== undefined) {
        options.title = meta.title;
        posterTitle.textContent = meta.title;
        root.setAttribute('aria-label', meta.title);
      }
      if (meta.subtitle !== undefined) {
        options.subtitle = meta.subtitle;
        root.setAttribute('data-subtitle', meta.subtitle);
      }
    }

    function activeCaption(time) {
      return options.captionsTrack.find(item => time >= item.start && time < item.end);
    }

    function render(time) {
      const duration = source.getDuration() || 1;
      const percent = Math.min(100, Math.max(0, (time / duration) * 100));
      played.style.width = `${percent}%`;
      thumb.style.left = `${percent}%`;
      progress.setAttribute('aria-valuenow', String(Math.round(percent)));
      timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;

      if (!options.video) {
        const caption = captionsOn ? activeCaption(time) : null;
        captionBox.textContent = caption ? caption.text : '';
        captionBox.hidden = !caption;
        if (caption) emit('captionchange', caption);
      }
    }

    function setPlayingUI(playing) {
      root.classList.toggle('crp--paused', !playing);
      root.classList.toggle('crp--playing', playing);
      toggle.innerHTML = playing ? ICONS.pause : ICONS.play;
      toggle.setAttribute('aria-label', playing ? labels.pause : labels.play);
      fullscreenBtn.innerHTML = isFullscreen() ? ICONS.exitFullscreen : ICONS.fullscreen;
    }

    function isFullscreen() {
      const element = document.fullscreenElement || document.webkitFullscreenElement;
      return element === stage || element === root;
    }

    function showControls() {
      root.classList.remove('crp--idle');
      clearTimeout(idleTimer);
      if (isPaused() || !options.idleAfter) return;
      idleTimer = setTimeout(() => root.classList.add('crp--idle'), options.idleAfter);
    }

    function play() {
      if (isPaused() && !destroyed) {
        const result = source.play();
        setPlayingUI(true);
        showControls();
        emit('play', getState());
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
      return api;
    }

    function pause() {
      if (!isPaused()) {
        source.pause();
        setPlayingUI(false);
        clearTimeout(idleTimer);
        root.classList.remove('crp--idle');
        emit('pause', getState());
        if (options.video && options.video.paused) return api;
      }
      return api;
    }

    function seek(value) {
      const duration = source.getDuration();
      const target = Math.min(Math.max(0, value), duration);
      source.seek(target);
      if (!options.video) render(target);
      emit('seek', getState());
      return api;
    }

    function seekBy(delta) {
      return seek(source.getTime() + delta);
    }

    function togglePlay() {
      return isPaused() ? play() : pause();
    }

    function setMuted(value) {
      source.setMuted(value);
      mute.innerHTML = value ? ICONS.muted : ICONS.volume;
      mute.setAttribute('aria-label', value ? labels.unmute : labels.mute);
      emit('volumechange', { muted: value });
    }

    function setCaptions(value) {
      captionsOn = value;
      captionsBtn.classList.toggle('is-active', captionsOn);
      if (!captionsOn) {
        captionBox.hidden = true;
        captionBox.textContent = '';
      } else if (!options.video) {
        render(source.getTime());
      }
      emit('captionschange', { captions: captionsOn });
    }

    function setRate(value) {
      source.setRate(value);
      node('rates')
        .querySelectorAll('.crp__rate')
        .forEach(button => button.classList.toggle('is-active', Number(button.dataset.rate) === value));
      emit('ratechange', { rate: value });
    }

    function toggleFullscreen() {
      if (isFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
        return;
      }
      const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (request) request.call(stage);
      emit('fullscreenchange', { fullscreen: true });
    }

    function getState() {
      return {
        paused: isPaused(),
        currentTime: source.getTime(),
        duration: source.getDuration(),
        rate: source.getRate(),
        muted: source.isMuted(),
        captions: captionsOn,
        title: options.title,
        subtitle: options.subtitle,
      };
    }

    function seekFromEvent(event) {
      const rect = progress.getBoundingClientRect();
      if (!rect.width) return;
      const x = (event.clientX === undefined ? event.touches[0].clientX : event.clientX) - rect.left;
      seek((x / rect.width) * source.getDuration());
    }

    const listeners = [];
    function on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    }

    on(center, 'click', () => play());
    on(toggle, 'click', () => togglePlay());
    on(root.querySelector('[data-t="replay10"]'), 'click', () => seekBy(-10));
    on(root.querySelector('[data-t="forward10"]'), 'click', () => seekBy(10));
    on(mute, 'click', () => setMuted(!source.isMuted()));
    on(captionsBtn, 'click', () => setCaptions(!captionsOn));
    on(fullscreenBtn, 'click', () => toggleFullscreen());
    on(settingsBtn, 'click', () => {
      menu.hidden = !menu.hidden;
      emit('settingschange', { open: !menu.hidden });
    });
    on(node('menu-close'), 'click', () => {
      menu.hidden = true;
    });
    node('rates').querySelectorAll('.crp__rate').forEach(button => {
      on(button, 'click', () => {
        setRate(Number(button.dataset.rate));
        menu.hidden = true;
      });
    });
    on(progress, 'mousedown', event => {
      dragging = true;
      seekFromEvent(event);
    });
    on(document, 'mousemove', event => {
      if (dragging) seekFromEvent(event);
    });
    on(document, 'mouseup', () => {
      dragging = false;
    });
    on(stage, 'mousemove', showControls);
    on(stage, 'click', event => {
      // Clicking the picture (not the controls) toggles playback, like Crunchyroll.
      if (event.target === stage || event.target.classList.contains('crp__gradient')) togglePlay();
    });
    on(root, 'keydown', event => {
      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seekBy(-10);
          break;
        case 'ArrowRight':
          seekBy(10);
          break;
        case 'm':
        case 'M':
          setMuted(!source.isMuted());
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          setCaptions(!captionsOn);
          break;
        default:
          break;
      }
      showControls();
    });
    on(document, 'fullscreenchange', () => {
      setPlayingUI(!isPaused());
      emit('fullscreenchange', { fullscreen: isFullscreen() });
    });

    source.onTick = time => {
      render(time);
      emit('timeupdate', getState());
    };
    source.onEnded = () => {
      setPlayingUI(false);
      emit('ended', getState());
    };

    setPoster(options.poster);
    setMeta({ title: options.title, subtitle: options.subtitle });
    setMuted(!!options.muted);
    setCaptions(!!options.captions);
    setPlayingUI(false);
    render(source.getTime());

    if (options.video) {
      on(options.video, 'play', () => setPlayingUI(true));
      on(options.video, 'pause', () => setPlayingUI(false));
      on(options.video, 'timeupdate', () => {
        render(options.video.currentTime);
        emit('timeupdate', getState());
      });
      on(options.video, 'loadedmetadata', () => render(options.video.currentTime));
      on(options.video, 'ended', () => {
        setPlayingUI(false);
        emit('ended', getState());
      });
    }

    if (options.autoplay) play();

    const api = {
      version: VERSION,
      root,
      getState,
      play,
      pause,
      toggle: togglePlay,
      seek,
      seekBy,
      setRate,
      setMuted,
      setCaptions,
      setPoster,
      setMeta,
      setDuration: value => {
        source.setDuration(value);
        render(source.getTime());
        return api;
      },
      showControls,
      openSettings: () => {
        menu.hidden = false;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        source.pause();
        source.destroy();
        clearTimeout(idleTimer);
        listeners.forEach(off => off());
        root.innerHTML = '';
        root.classList.remove('crp', 'crp--paused', 'crp--playing', 'crp--idle', 'crp--media');
      },
    };

    emit('ready', getState());
    return api;
  }

  /** Binds the skin to an existing <video> element that lives next to the container. */
  function attachVideo(rootOrSelector, video, userOptions) {
    return create(rootOrSelector, merge(DEFAULTS, merge(userOptions || {}, { video })));
  }

  const CrunchyrollPlayer = { create, attachVideo, version: VERSION, formatTime, icons: ICONS };

  global.CrunchyrollPlayer = CrunchyrollPlayer;
  if (typeof module !== 'undefined' && module.exports) module.exports = CrunchyrollPlayer;
})(typeof window !== 'undefined' ? window : globalThis);
