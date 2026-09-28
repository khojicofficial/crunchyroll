# CrunchyrollPlayer

A dependency-free, Crunchyroll-styled video player shell — the player from the MAL-Sync
Crunchyroll dev preview, extracted into two files you can drop into any page.

```
crunchyroll-player/
├── crunchyroll-player.js    ~460 lines, no dependencies, no build step
├── crunchyroll-player.css   dark Crunchyroll-ish skin, scoped under `.crp`
├── index.html               standalone demo (open it straight from disk)
└── README.md
```

## Quick start

```html
<link rel="stylesheet" href="crunchyroll-player.css" />
<div id="player"></div>
<script src="crunchyroll-player.js"></script>
<script>
  const player = CrunchyrollPlayer.create('#player', {
    title: 'Solo Leveling',
    subtitle: 'S1 E5 · A Pretty Good Day to Die',
    poster: 'linear-gradient(135deg, #2b1f4d, #05060b)', // any CSS background
    duration: 24 * 60, // seconds
  });
  player.play();
</script>
```

No bundler, no jQuery and no icon font: the icons are inline SVG, so it also works offline and
from `file://` (just open `index.html`).

## Two modes

**Simulated playback** — `CrunchyrollPlayer.create(container, options)` runs its own clock.
Ideal for previews, demos and design work, or as a poster / coming-soon surface.

**Real media** — bind it to an existing `<video>` and every control drives that element:

```html
<video id="video" src="episode.mp4" playsinline></video>
<div id="player"></div>
<script>
  const player = CrunchyrollPlayer.attachVideo('#player', document.getElementById('video'), {
    title: 'Solo Leveling',
    poster: 'url(poster.jpg)',
  });
</script>
```

## Options

| Option          | Default          | Meaning                                                      |
| --------------- | ---------------- | ------------------------------------------------------------ |
| `title`         | `'Untitled'`     | Poster headline + `aria-label`                               |
| `subtitle`      | `''`             | Free-form, exposed through `getState()` / `data-subtitle`    |
| `poster`        | dark gradient    | Anything CSS accepts for `background` (`url(…)`, gradient…)  |
| `duration`      | `1440`           | Length in seconds (simulated mode)                           |
| `startAt`       | `0`              | Start position                                               |
| `rate`          | `1`              | Playback speed                                               |
| `muted`         | `false`          | Start muted                                                  |
| `captions`      | `true`           | Subtitles on/off                                             |
| `captionsTrack` | `[]`             | `[{ start, end, text }]` in seconds                          |
| `autoplay`      | `false`          | Play as soon as it is created                                |
| `idleAfter`     | `3000`           | Hide the controls after N ms of inactivity while playing      |
| `video`         | –                | A `<video>` element (this is what `attachVideo` sets)        |
| `labels`        | English strings  | Override the `aria-label` / title strings                    |

## Controller API

| Method                              | Returns    | Notes                                        |
| ----------------------------------- | ---------- | --------------------------------------------- |
| `play()` / `pause()` / `toggle()`   | controller | `toggle()` switches state                     |
| `seek(seconds)` / `seekBy(delta)`   | controller | Clamped to `[0, duration]`                    |
| `setDuration(seconds)`              | controller | Simulated mode only                           |
| `setRate(rate)`                     | controller | Updates the speed menu                        |
| `setMuted(flag)` / `setCaptions(flag)` | controller | Updates the icons                          |
| `setPoster(cssBackground)`          | controller | Change artwork at runtime                     |
| `setMeta({ title, subtitle })`      | controller | Change the labels                             |
| `getState()`                        | object     | `{ paused, currentTime, duration, rate, muted, captions, title, subtitle }` |
| `showControls()`                    | controller | Reveals the control bar                       |
| `openSettings()`                    | controller | Opens the speed menu                          |
| `destroy()`                         | –          | Removes listeners and empties the container   |

Helpers: `CrunchyrollPlayer.formatTime(seconds)`, `CrunchyrollPlayer.version`.

## Events

Every event is a `CustomEvent` dispatched on the container (`player.root`), so plain
`addEventListener` works:

| Event                   | `event.detail`                          |
| ----------------------- | --------------------------------------- |
| `crp:ready`             | initial state                           |
| `crp:play` / `crp:pause`| state                                   |
| `crp:timeupdate`        | state — fires ~10×/second while playing  |
| `crp:seek`              | state                                   |
| `crp:ended`             | state                                   |
| `crp:ratechange`        | `{ rate }`                              |
| `crp:volumechange`      | `{ muted }`                             |
| `crp:captionschange`    | `{ captions }`                          |
| `crp:captionchange`     | `{ start, end, text }` (simulated mode) |
| `crp:fullscreenchange`  | `{ fullscreen }`                        |

```js
player.root.addEventListener('crp:timeupdate', event => {
  console.log(event.detail.currentTime, '/', event.detail.duration);
});
```

## Keyboard shortcuts

| Key             | Action                     |
| --------------- | -------------------------- |
| `space` / `k`   | Play / pause               |
| `←` / `→`       | Seek −10s / +10s           |
| `m`             | Mute                       |
| `c`             | Toggle subtitles           |
| `f`             | Fullscreen                 |

Shortcuts are bound on the container (it is focusable), so give it focus — or add your own
handler elsewhere and call the API.

## Wiring it to a tracker (MAL-Sync style)

```js
const player = CrunchyrollPlayer.attachVideo('#player', video, { title: 'Solo Leveling' });

player.root.addEventListener('crp:timeupdate', event => {
  const percent = event.detail.currentTime / event.detail.duration;
  if (percent > 0.85) markEpisodeAsWatched(currentEpisode); // e.g. a MAL progress update
});

player.root.addEventListener('crp:ended', () => navigateTo(nextEpisodeUrl));
```

Because it is just a shell, you can also drive it from the outside: a page script that already
knows the episode data can call `setMeta()` / `setPoster()` without touching the DOM.

## Theming

All colours hang off CSS custom properties on `.crp`:

```css
.crp {
  --crp-orange: #f47521;
  --crp-surface: #14161c;
  --crp-text: #f2f2f2;
  --crp-muted: #a8abb4;
}
```

## Notes & limits

- It is a **player shell**, not a video decoder: in simulated mode there is no media, the
  timeline is a clock. For real playback use `attachVideo`.
- No HLS/DASH handling — pass a `<video>` that already plays (hls.js, native HLS, …).
- Fullscreen uses the standard API with a `webkit` fallback; browsers that block it simply
  ignore the request.
- Progress-bar scrubbing uses `mousedown`/`mousemove`/`mouseup` (touch works too because
  browsers synthesise the mouse events); keyboard seeking works everywhere.
- Extracted from the MAL-Sync dev preview (`dev-preview/`). MAL-Sync is GPL-3.0-only, so this
  player is GPL-3.0-only as well — keep the header comment in `crunchyroll-player.js` if you
  redistribute it.
