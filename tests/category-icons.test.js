import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_ICON_OPTIONS,
  ICON_GROUPS,
  ICON_META,
  resolveCategoryIconKey,
  categoryIconNode
} from '../js/category-icons.js';
import { STARTER_CATEGORIES } from '../js/categories.js';

test('category icon library is rich, unique, and fully grouped', () => {
  const keys = CATEGORY_ICON_OPTIONS.map(option => option.key);
  const tokens = CATEGORY_ICON_OPTIONS.map(option => option.token);
  const groupedKeys = ICON_GROUPS.flatMap(group => group.keys);

  assert.equal(keys.length, 155);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.deepEqual(groupedKeys, keys);
  assert.deepEqual(new Set(keys), new Set(Object.keys(ICON_META)));
  assert.equal(new Set(tokens.map(token => token.replace(/\uFE0F/g, ''))).size, tokens.length);
  assert.equal(new Set(CATEGORY_ICON_OPTIONS.map(option => option.label)).size, keys.length);
  assert.equal(new Set(ICON_GROUPS.map(group => group.id)).size, ICON_GROUPS.length);
  keys.forEach(key => {
    assert.ok(ICON_META[key], `Missing metadata for ${key}`);
    assert.ok(ICON_META[key].token.length <= 8, `${key} exceeds the stored token limit`);
  });
});

test('every picker token and label resolves to itself, never a competing legacy alias', () => {
  for (const { key, token, label } of CATEGORY_ICON_OPTIONS) {
    assert.equal(resolveCategoryIconKey({ icon: token, name: '完全不同的分类' }), key, label);
    assert.equal(resolveCategoryIconKey(token), key, label);
    assert.equal(resolveCategoryIconKey(token.replace(/\uFE0F/g, '')), key, label);
    assert.equal(resolveCategoryIconKey({ name: label }), key, label);
  }
  assert.equal(resolveCategoryIconKey('☕'), 'coffee');
  assert.equal(resolveCategoryIconKey('🚗'), 'car');
  assert.equal(resolveCategoryIconKey('🛒'), 'grocery');
});

test('specific names take precedence over broad or unrelated substrings', () => {
  const examples = {
    '零食支出': 'snack', '生活水费': 'water', '水电缴费': 'utility', '燃气费': 'gas',
    '家庭支出': 'family', '家庭保险': 'insurance', '房贷还款': 'loan', '物业管理费': 'property',
    '工资收入': 'salary', '奖学金': 'bonus', '兼职收入': 'parttime', '报销收入': 'receipt',
    '银行利息': 'interest', '基金分红': 'interest', '医疗保险': 'insurance', '汽车保险': 'insurance',
    '奶茶饮料': 'drink', '米饭支出': 'rice', '便当盒饭': 'bento', '买菜超市': 'grocery',
    '甜品布丁': 'dessert', '水果支出': 'fruit', '手机话费': 'phonecall', '宽带网费': 'internet',
    '咖啡机购置': 'coffeemachine', '空调购置': 'airconditioner', '风扇购置': 'fan',
    '手机配件充电器': 'charger', '洗衣机维修': 'tools', '洗衣服务': 'laundry',
    '网约车费': 'taxi', '公交车费': 'bus', '电动车费': 'scooter', '高速费': 'toll',
    '宠物食品': 'petfood', '宝宝奶粉': 'babybottle', '纸尿裤': 'diaper',
    '挂号看病': 'hospital', '买药费用': 'pill', '健康体检': 'checkup', '康复护理': 'care',
    '视频会员续费': 'streaming', '音乐会员': 'subscription', '课程培训': 'course',
    '学习资料': 'book', '份子钱礼金': 'redpacket', '香水': 'perfume', '护肤品': 'skincare',
    '美甲护理': 'nail', '网球运动': 'racket', '篮球运动': 'basketball', '游泳健身': 'swimming',
    '信用卡': 'card', '卡通周边': 'other', '充值': 'other', '未知分类': 'other'
  };
  for (const [name, key] of Object.entries(examples)) assert.equal(resolveCategoryIconKey({ name }), key, name);
  assert.equal(resolveCategoryIconKey({ icon: '🎁', name: '水费' }), 'gift', 'Explicit choices must win');
  assert.equal(resolveCategoryIconKey(null), 'other');
  assert.equal(resolveCategoryIconKey({ icon: 'unknown', name: '停车费' }), 'parking');
});

test('legacy backup tokens stay recognized and natural aliases match their actual subjects', () => {
  const legacy = { '🍱': 'bento', '🍷': 'alcohol', '💵': 'coin', '💎': 'jewelry', '🎓': 'learning', '🎉': 'cake', '🧰': 'tools', '💙': 'heart', '💚': 'heart', '💛': 'heart' };
  for (const [icon, key] of Object.entries(legacy)) assert.equal(resolveCategoryIconKey({ icon }), key);
  const originalTokens = ['🍜','🍬','🥤','☕','🍺','🍎','🍞','🍔','🍲','🍦','🛒','🥕','🥗','🍕','🍗','🦐','🫕','🥟','🍚','🥛','🫖','🍪','🧃','🥚','🍟','🥡','🚇','🚗','✈️','🏨','📦','🚲','🚆','⛽','🅿️','⛴️','🛍️','💄','✂️','👕','📱','👟','👜','💍','💻','🧺','🏠','💡','🔧','💊','🐾','👶','🔑','🛋️','🧹','🌿','📚','🎮','🎬','🎤','⚽','🏋️','📖','✏️','📝','🎵','📷','🎫','🎁','🧧','🎂','👪','🤲','🦷','👓','❤️','💼','💰','📈','🛡️','🏦','💳','👛','🧾','🐷','🤝','🏛️','🏢','🔔','🏆','➕'];
  assert.equal(originalTokens.length, 91);
  for (const icon of originalTokens) assert.notEqual(resolveCategoryIconKey({ icon }), icon === '➕' ? 'invalid' : 'other', icon);
});

test('household, health and education groups contain their own scenes, without misplaced baby/pet icons', () => {
  const keys = id => ICON_GROUPS.find(group => group.id === id).keys;
  for (const key of ['family', 'baby', 'babybottle', 'diaper', 'pet', 'petfood', 'toys']) assert.ok(keys('family').includes(key));
  for (const key of ['baby', 'pet']) assert.ok(!keys('health').includes(key));
  assert.ok(keys('food').includes('grocery'));
  assert.ok(keys('finance').includes('insurance'));
  assert.ok(keys('edu').includes('trophy'));
  assert.ok(keys('fun').includes('subscription'));
});

test('new starter choices use icons that match their intended subjects', () => {
  const expected = { '通讯': 'phonecall', '旅行': 'luggage', '其他': 'other', '奖金': 'bonus', '兼职': 'parttime', '医疗': 'hospital' };
  for (const [name, key] of Object.entries(expected)) assert.equal(resolveCategoryIconKey(STARTER_CATEGORIES.find(c => c.name === name)), key);
});

test('every icon has unique native SVG geometry and decorative/accessible modes', () => {
  const previous = globalThis.document;
  globalThis.document = { createElementNS: (namespace, tag) => ({
    namespace, tag, attributes: {}, innerHTML: '',
    setAttribute(name, value) { this.attributes[name] = value; }
  }) };
  try {
    const shapes = new Set();
    for (const { token, label } of CATEGORY_ICON_OPTIONS) {
      const svg = categoryIconNode(token, { size: 27 });
      assert.equal(svg.namespace, 'http://www.w3.org/2000/svg');
      assert.equal(svg.attributes.viewBox, '0 0 24 24');
      assert.equal(svg.attributes.stroke, 'currentColor');
      assert.equal(svg.attributes['aria-hidden'], 'true');
      assert.match(svg.innerHTML, /<(path|rect|circle|ellipse)\b/);
      assert.doesNotMatch(svg.innerHTML, /script|image|foreignObject|href|\bon\w+=/i);
      assert.ok(!shapes.has(svg.innerHTML), `Duplicate geometry: ${label}`);
      shapes.add(svg.innerHTML);
    }
    const named = categoryIconNode('☕', { size: 16, title: '咖啡', className: 'test-icon' });
    assert.equal(named.attributes.role, 'img');
    assert.equal(named.attributes['aria-label'], '咖啡');
    assert.equal(named.attributes['aria-hidden'], undefined);
    assert.equal(named.attributes.class, 'test-icon');
  } finally { globalThis.document = previous; }
});

test('common category names resolve to the expanded icons', () => {
  assert.equal(resolveCategoryIconKey({ name: '停车费' }), 'parking');
  assert.equal(resolveCategoryIconKey({ name: '房租' }), 'rent');
  assert.equal(resolveCategoryIconKey({ name: '买菜' }), 'grocery');
  assert.equal(resolveCategoryIconKey({ name: '书籍' }), 'book');
  assert.equal(resolveCategoryIconKey({ name: '订阅续费' }), 'subscription');
});
