import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('v2.4.1 keeps two hundred recent transactions and avoids category autofocus', () => {
  const home = read('js/views/home.js');
  const categories = read('js/views/categories.js');

  assert.match(home, /listTransactions\(\{\s*limit:\s*200\s*\}\)/);
  assert.doesNotMatch(categories, /autofocus/i);
  assert.doesNotMatch(categories, /nameInput\.focus\s*\(/);
});

test('v2.4.1 chart animations are present and motion-safe', () => {
  const pie = read('js/charts/pie-chart.js');
  const home = read('js/views/home.js');
  const css = read('css/style.css');

  assert.match(pie, /requestAnimationFrame/);
  assert.match(pie, /prefers-reduced-motion:\s*reduce/);
  assert.match(home, /class="gauge-progress"/);
  assert.match(css, /@keyframes\s+gauge-sweep/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
