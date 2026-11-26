/*
 * 打包 .wlpkg.gz 到发布目录。
 *
 * 格式与宿主 tools/build-community-package.mjs 一致：
 *   gzip( headerJSON + "\n" + 按 header.files 顺序拼接的文件内容 )
 *   header = { format: 1, files: [{ path, size, sha256 }] }
 *
 * 为什么不用宿主那个工具：它的 permitted() 对**整条路径逐段**跑敏感文件名正则，
 * 包括目录段。node_modules/undici/lib/web/cookies 这一节叫 cookies，于是命中
 * `cookies?` 被判敏感，整个目录连同 4 个运行时代码一起被丢弃，装上去 cheerio
 * 直接 Cannot find module './lib/web/cookies'。文件数只差 4，看清单看不出来。
 * 这里只对**文件名**（最后一段）判断，目录段不参与。
 *
 * 用法：node scripts/package.mjs <输出目录>
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist', 'search-engine');

const SENSITIVE_FILE = /^(?:credentials?|cookies?|secrets?|tokens?)(?:\.(?:json|txt|ya?ml|sqlite|db))?$|^(?:id_rsa|id_ecdsa|id_ed25519)$|\.(?:key|pfx|p12|ppk|jks|kdbx|sqlite|db|log|wlpkg\.gz)$/i;
const DROP_SEGMENTS = new Set(['data', '.tmp', 'tests', '.artifacts', 'node_modules/.cache']);

function keep(rel) {
  const parts = rel.split('/');
  if (parts.some(part => part.startsWith('.'))) return false;
  if (parts.some((part, i) => DROP_SEGMENTS.has(part) && i < parts.length - 1)) return false;
  const file = parts.at(-1);
  if (SENSITIVE_FILE.test(file)) return false;
  if (file.includes('.bak-')) return false;
  return true;
}

function walk(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else if (entry.isFile()) { if (keep(rel)) out.push(rel); }
    else throw Error('发行目录里有链接或特殊文件：' + rel);
  }
  return out;
}

function digest(path) {
  return new Promise((ok, bad) => {
    const hash = createHash('sha256');
    createReadStream(path).on('error', bad).on('data', c => hash.update(c)).on('end', () => ok(hash.digest('hex')));
  });
}

if (!statSync(source, { throwIfNoEntry: false })) throw Error('没有 dist/search-engine，先跑 scripts/build.mjs');

const manifest = readFileSync(join(source, 'plugin.yaml'), 'utf8');
const idMatch = manifest.match(/^id:\s*(\S+)\s*$/m);
const versionMatch = manifest.match(/^version:\s*(\S+)\s*$/m);
if (!idMatch || !versionMatch) throw Error('plugin.yaml 缺少 id 或 version');
const pkgVersion = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
if (pkgVersion !== versionMatch[1]) throw Error(`版本不一致：plugin.yaml ${versionMatch[1]} / package.json ${pkgVersion}`);
if (!statSync(join(source, 'index.ts'), { throwIfNoEntry: false })) throw Error('发行目录缺少 index.ts');

const paths = walk(source).sort();
if (!paths.includes('plugin.yaml') || !paths.includes('index.ts')) throw Error('发行目录缺少清单或入口');

const files = [];
for (const path of paths) {
  const full = join(source, path);
  if (realpathSync(full) !== resolve(full)) throw Error('发行目录里有链接：' + path);
  if (!lstatSync(full).isFile()) throw Error('不是普通文件：' + path);
  const size = lstatSync(full).size;
  files.push({ path, size, sha256: await digest(full) });
}

const header = Buffer.from(JSON.stringify({ format: 1, files }));
if (header.length > 32 * 1024 ** 2) throw Error('文件清单过大');

const output = resolve(process.argv[2] ?? join(root, 'release'));
if (!isAbsolute(output)) throw Error('输出目录必须是绝对路径');
mkdirSync(output, { recursive: true });
const filename = idMatch[1] + '-' + versionMatch[1] + '.wlpkg.gz';
const asset = join(output, filename);
const temp = asset + '.partial-' + process.pid;
if (resolve(asset).startsWith(resolve(source) + sep)) throw Error('输出目录不能放在发行目录里');

async function* payload() {
  yield header;
  yield Buffer.from('\n');
  for (const file of files) {
    const hash = createHash('sha256');
    let tail = '';
    for await (const chunk of createReadStream(join(source, file.path))) {
      const text = tail + chunk.toString('latin1');
      if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(text)) throw Error('文件内含私钥标记：' + file.path);
      tail = text.slice(-96);
      hash.update(chunk);
      yield chunk;
    }
    if (hash.digest('hex') !== file.sha256) throw Error('打包期间文件已变更：' + file.path);
  }
}

try {
  await pipeline(Readable.from(payload()), createGzip({ level: 9 }), createWriteStream(temp, { flags: 'wx' }));
  const sizeBytes = lstatSync(temp).size;
  if (sizeBytes > 2 * 1024 ** 3) throw Error('超过 2 GiB');
  const sha256 = await digest(temp);
  try { linkSync(temp, asset); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  console.log(JSON.stringify({ id: idMatch[1], version: versionMatch[1], filename, sizeBytes, sha256, fileCount: files.length }, null, 2));
} finally {
  try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
