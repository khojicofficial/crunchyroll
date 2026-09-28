/**
 * Packages the standalone player (dev-preview/standalone/crunchyroll-player) into a zip.
 *
 * Dependency-free: this writes the archive itself (deflate via node:zlib), so it works
 * without `zip`, `archiver` or any other tool.
 *
 * Outputs:
 *   dev-preview/public/download/crunchyroll-player.zip   (served at /download/…)
 *   <workspace>/crunchyroll-player.zip                   (easy to grab from the file tree)
 *
 * Usage: node dev-preview/build-player-zip.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const workspaceRoot = path.dirname(repoRoot);
const sourceDir = path.join(__dirname, 'standalone', 'crunchyroll-player');
const zipName = 'crunchyroll-player.zip';
const outputDir = path.join(__dirname, 'public', 'download');

// --- minimal zip writer -----------------------------------------------------------------

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function collectFiles(dir, prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.name !== '.DS_Store')
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const absolute = path.join(dir, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? collectFiles(absolute, name) : [{ absolute, name }];
    });
}

function createZip(files, archiveRoot) {
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(file => {
    const name = `${archiveRoot}/${file.name}`;
    const nameBuffer = Buffer.from(name, 'utf8');
    const content = fs.readFileSync(file.absolute);
    const deflated = zlib.deflateRawSync(content, { level: 9 });
    const useDeflate = deflated.length < content.length;
    const body = useDeflate ? deflated : content;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + body.length;
    console.log(
      `  + ${name} (${content.length} B → ${body.length} B${useDeflate ? '' : ', stored'})`,
    );
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

// --- build ------------------------------------------------------------------------------

if (!fs.existsSync(sourceDir)) {
  console.error(`missing player source directory: ${sourceDir}`);
  process.exit(1);
}

const files = collectFiles(sourceDir);
console.log(`packaging ${files.length} file(s) from ${path.relative(repoRoot, sourceDir)}`);
const zip = createZip(files, 'crunchyroll-player');

fs.mkdirSync(outputDir, { recursive: true });
const servedPath = path.join(outputDir, zipName);
fs.writeFileSync(servedPath, zip);
const workspacePath = path.join(workspaceRoot, zipName);
fs.writeFileSync(workspacePath, zip);

console.log(`wrote ${path.relative(repoRoot, servedPath)} (${(zip.length / 1024).toFixed(1)} KB)`);
console.log(`wrote ${workspacePath} (${(zip.length / 1024).toFixed(1)} KB)`);
console.log('download route: /download/' + zipName);
