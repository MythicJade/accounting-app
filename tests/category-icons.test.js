import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_ICON_OPTIONS,
  ICON_GROUPS,
  ICON_META,
  resolveCategoryIconKey
} from '../js/category-icons.js';

test('category icon library is rich, unique, and fully grouped', () => {
  const keys = CATEGORY_ICON_OPTIONS.map(option => option.key);
  const tokens = CATEGORY_ICON_OPTIONS.map(option => option.token);
  const groupedKeys = ICON_GROUPS.flatMap(group => group.keys);

  assert.ok(keys.length >= 91);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.deepEqual(groupedKeys, keys);
  keys.forEach(key => assert.ok(ICON_META[key], `Missing metadata for ${key}`));
});

test('common category names resolve to the expanded icons', () => {
  assert.equal(resolveCategoryIconKey({ name: '停车费' }), 'parking');
  assert.equal(resolveCategoryIconKey({ name: '房租' }), 'rent');
  assert.equal(resolveCategoryIconKey({ name: '买菜' }), 'grocery');
  assert.equal(resolveCategoryIconKey({ name: '书籍' }), 'book');
  assert.equal(resolveCategoryIconKey({ name: '订阅续费' }), 'subscription');
});
