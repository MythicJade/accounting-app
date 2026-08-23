import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('manifest.json'));
const versionSource = read('js/version.js');
const workerSource = read('sw.js');
const indexSource = read('index.html');
const expected = pkg.version;

assert.match(expected, /^\d+\.\d+\.\d+$/);
assert.match(versionSource, new RegExp(`APP_VERSION\\s*=\\s*['\"]${escapeRegExp(expected)}['\"]`));
assert.match(workerSource, new RegExp(`accounting-v${escapeRegExp(expected)}`));
assert.equal(manifest.id, './');
assert.doesNotMatch(indexSource, /user-scalable\s*=\s*no/i);
assert.doesNotMatch(indexSource, /navigator\.serviceWorker\.register/);
assert.doesNotMatch(workerSource, /xlsx\.full\.min\.js/);

const precache = [...workerSource.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]);
for (const path of precache) assert.ok(existsSync(resolve(root, path)), `Missing precache file: ${path}`);

console.log(`Static checks passed for v${expected} (${precache.length} precached files).`);

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
