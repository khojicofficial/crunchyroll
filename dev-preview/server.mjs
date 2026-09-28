/**
 * Local preview server for MAL-Sync.
 *
 *   /                  -> landing page
 *   /crunchyroll/*     -> mock Crunchyroll site (watch + series pages)
 *   /chibi/*           -> dist/webextension/chibi (the real built chibi pages)
 *   /extension/*       -> dist/webextension/* (e.g. the real proxy_request.js)
 *   /popup/*           -> the real built extension popup, running with mocked chrome APIs
 *   /player/*          -> standalone CrunchyrollPlayer package (dev-preview/standalone)
 *   /download/*.zip    -> packaged downloads, e.g. the standalone player
 *   /mock/crunchyroll/* -> fake Crunchyroll CMS API
 *
 * No dependencies, no external network access required.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const publicDir = path.join(__dirname, 'public');
const standaloneDir = path.join(__dirname, 'standalone');
const distDir = path.join(repoRoot, 'dist', 'webextension');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock', 'library.json'), 'utf8'));

let commit = 'unknown';
let commitMessage = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
  commitMessage = execSync('git log -1 --pretty=%s', { cwd: repoRoot }).toString().trim();
} catch {
  /* not a git checkout, ignore */
}

const META = {
  version: packageJson.version,
  commit,
  commitMessage,
  built: fs.existsSync(path.join(distDir, 'manifest.json')),
};

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    // The preview is shown inside an iframe served from the sandbox domain, so keep
    // framing open and let the harness fetch across ports.
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  });
  res.end(body);
}

function sendJson(res, data, status = 200) {
  send(res, status, JSON.stringify(data, null, 2), mime['.json']);
}

function serveFile(res, filePath, transform) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, `Not found: ${path.basename(filePath)}`);
      return;
    }
    let body = data;
    let type = mime[path.extname(filePath)] || 'application/octet-stream';
    if (transform && filePath.endsWith('.html')) {
      body = Buffer.from(transform(data.toString('utf8')));
      type = mime['.html'];
    }
    send(res, 200, body, type);
  });
}

/** Same as serveFile, but forces the browser to save the file. */
function serveDownload(res, filePath, filename) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, `Not found: ${path.basename(filePath)}`);
      return;
    }
    send(res, 200, data, mime[path.extname(filePath)] || 'application/octet-stream', {
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  });
}

let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
} catch {
  /* no build output yet */
}

/** Index of packaged downloads (the standalone player zip), shown on the landing page. */
function readDownloads() {
  const dir = path.join(publicDir, 'download');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.zip'))
    .map(name => ({ name, size: fs.statSync(path.join(dir, name)).size }));
}

/** Every page gets the build metadata injected, the panel shows it in the header. */
function injectMeta(html) {
  const globals = [
    `window.__MALSYNC_PREVIEW__ = ${JSON.stringify(META)};`,
    `window.__MALSYNC_DOWNLOADS__ = ${JSON.stringify(readDownloads())};`,
  ];
  // The popup asks `chrome.runtime.getManifest()` for its permission overview, so it
  // gets the real, built manifest.
  if (manifest) globals.push(`window.__MALSYNC_MANIFEST__ = ${JSON.stringify(manifest)};`);
  return html.replace('<!--PREVIEW_META-->', `<script>${globals.join('')}</script>`);
}

function findEpisode(episodeId) {
  for (const series of library.series) {
    const episode = series.episodes.find(e => e.id === episodeId);
    if (episode) return { series, episode };
  }
  return null;
}

function findSeries(seriesId) {
  return library.series.find(s => s.series_id === seriesId) || null;
}

/** Same payload shape the real Crunchyroll CMS returns for /cms/objects/<id>. */
function episodeResponse(episodeId) {
  const found = findEpisode(episodeId);
  if (!found) return null;
  const { series, episode } = found;
  return {
    data: [
      {
        type: 'episode',
        id: episode.id,
        title: episode.title,
        description: episode.description,
        slug_title: episode.slug_title,
        episode_metadata: {
          episode_number: episode.episode_number,
          season_display_number: String(episode.episode_number),
          season_id: episode.season_id,
          season_number: episode.season_number,
          season_sequence_number: episode.season_number,
          season_slug_title: episode.season_slug_title,
          season_title: episode.season_title,
          sequence_number: episode.episode_number,
          series_id: series.series_id,
          series_slug_title: series.series_slug_title,
          series_title: series.series_title,
        },
      },
    ],
    meta: {},
    total: 1,
  };
}

function seasonsResponse(seriesId) {
  const series = findSeries(seriesId);
  if (!series) return null;
  return {
    data: series.seasons.map(season => ({
      id: season.id,
      title: season.title,
      description: series.description,
      season_display_number: season.season_display_number,
      season_number: season.season_number,
      season_sequence_number: season.season_sequence_number,
      series_id: series.series_id,
      slug_title: season.slug_title,
      number_of_episodes: season.number_of_episodes,
    })),
    meta: {},
    total: series.seasons.length,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // Fake Crunchyroll API -----------------------------------------------------
  if (pathname.startsWith('/mock/crunchyroll/cms/objects/')) {
    const id = pathname.split('/').pop();
    const data = episodeResponse(id);
    if (!data) return sendJson(res, { error: 'not found' }, 404);
    return sendJson(res, data);
  }

  if (pathname.startsWith('/mock/crunchyroll/cms/series/') && pathname.endsWith('/seasons')) {
    const id = pathname.split('/')[5];
    const data = seasonsResponse(id);
    if (!data) return sendJson(res, { error: 'not found' }, 404);
    return sendJson(res, data);
  }

  if (pathname === '/mock/crunchyroll/library.json') {
    return sendJson(res, library);
  }

  if (pathname === '/mock/preview/meta.json') {
    return sendJson(res, META);
  }

  // Built extension files ----------------------------------------------------
  if (pathname.startsWith('/chibi/')) {
    return serveFile(res, path.join(distDir, pathname.replace('/chibi/', 'chibi/')));
  }

  if (pathname.startsWith('/extension/')) {
    return serveFile(res, path.join(distDir, pathname.replace('/extension/', '')));
  }

  // Pages --------------------------------------------------------------------
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(publicDir, 'index.html'), injectMeta);
  }

  if (pathname === '/popup' || pathname === '/popup/') {
    // Preview shell: the real popup bundle plus the chrome.* shim.
    return serveFile(res, path.join(publicDir, 'popup', 'index.html'), injectMeta);
  }

  if (pathname.startsWith('/popup/')) {
    // Everything else under /popup/ is served straight from the build output.
    return serveFile(res, path.join(distDir, pathname.replace('/popup/', '')), injectMeta);
  }

  if (pathname.startsWith('/mock/mal/')) {
    return serveFile(res, path.join(__dirname, 'mock', 'mal', pathname.replace('/mock/mal/', '')));
  }

  // Standalone player (extracted from this preview) + its zip download --------------
  if (pathname === '/player' || pathname === '/player/') {
    return serveFile(res, path.join(standaloneDir, 'crunchyroll-player', 'index.html'));
  }

  if (pathname.startsWith('/player/')) {
    return serveFile(
      res,
      path.join(standaloneDir, 'crunchyroll-player', pathname.replace('/player/', '')),
    );
  }

  if (pathname.startsWith('/download/')) {
    const file = path.join(__dirname, 'public', 'download', pathname.replace('/download/', ''));
    if (file.startsWith(path.join(__dirname, 'public', 'download')) && fs.existsSync(file)) {
      return serveDownload(res, file, path.basename(file));
    }
    return send(res, 404, `No download: ${path.basename(pathname)}`);
  }

  // Static -------------------------------------------------------------------
  // Checked before the SPA fallback below so that /crunchyroll/*.js|*.css are served
  // as files instead of the mock site shell.
  if (pathname !== '/crunchyroll/' && pathname !== '/crunchyroll') {
    const staticPath = path.join(publicDir, pathname);
    if (
      staticPath.startsWith(publicDir) &&
      fs.existsSync(staticPath) &&
      fs.statSync(staticPath).isFile()
    ) {
      return serveFile(res, staticPath, injectMeta);
    }
  }

  if (pathname === '/crunchyroll' || pathname.startsWith('/crunchyroll/')) {
    // Client side routing, every Crunchyroll URL renders the same shell.
    return serveFile(res, path.join(publicDir, 'crunchyroll', 'index.html'), injectMeta);
  }

  return send(res, 404, `Not found: ${pathname}`);
});

server.listen(PORT, HOST, () => {
  console.log(`MAL-Sync preview running on http://${HOST}:${PORT}`);
  console.log(`  Crunchyroll lab : /crunchyroll/watch/G9VU2PW0J/solo-leveling-episode-5`);
  console.log(`  Extension popup : /popup/`);
  console.log(`  Player (standalone) : /player/`);
  console.log(`  Build           : ${META.version} (${META.commit}) dist built: ${META.built}`);
});
