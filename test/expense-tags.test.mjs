import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, validatePlan, forecast, demoPlan, reviseEstimate, plannedAmount } from '../public/model.js';
import { CATEGORY_STARTERS, tagLibrary, groupExpenses, activeDimensions, normalizeTagName, uniqueTagName, removeTagDefinition } from '../public/expense-tags.js';

function fixture() {
  const p = blankPlan();
  p.objects = [{ id: 'family', name: 'Family', type: 'group' }, { id: 'empty', name: 'Empty', type: 'person' }];
  p.tagDefinitions = tagLibrary(p);
  p.items = Array.from({ length: 4 }, (_, n) => ({ id: `i${n}`, objectId: 'family', name: `Expense ${n}`, description: '', type: 'expense', status: n === 3 ? 'tentative' : 'confirmed', amount: n === 0 ? null : n * 1000,
    recurrence: n < 2 ? { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 } : { kind: 'once', anchor: '2026-11', end: '2026-11', everyMonths: 1 }, amountChanges: [] }));
  const [category, necessity] = p.tagDefinitions;
  p.items[0].tags = [{ keyId: category.id, valueId: category.values[0].id }, { keyId: necessity.id, valueId: necessity.values[0].id }];
  p.items[1].tags = [{ keyId: category.id, valueId: category.values[1].id }];
  return validatePlan(p);
}
const leaves = groups => groups.flatMap(g => g.children.length ? leaves(g.children) : [g]);
test('absent-only exact starters are deterministic, collision-safe and side-effect free', () => {
  const p = blankPlan(), raw = JSON.stringify(p), defs = tagLibrary(p);
  assert.equal(defs[0].name, 'Danh mục'); assert.deepEqual(defs[0].values.map(v => v.name), CATEGORY_STARTERS);
  assert.deepEqual(defs[1].values.map(v => v.name), ['Thiết yếu', 'Tùy chọn']);
  assert.deepEqual(tagLibrary(p), defs); assert.equal(JSON.stringify(p), raw);
  p.objects.push({ id: defs[0].id, name: 'Collision', type: 'person' }, { id: defs[0].values[0].id, name: 'Collision value', type: 'person' });
  const next = { ...p, tagDefinitions: tagLibrary(p) }; validatePlan(next);
  assert.notEqual(next.tagDefinitions[0].id, defs[0].id);
  assert.deepEqual(tagLibrary({ ...p, tagDefinitions: [] }), []);
  const edited = [{ id: 'edited', name: 'Edited', values: [] }];
  assert.deepEqual(tagLibrary({ ...p, tagDefinitions: edited }), edited);
});
test('tag schema round-trips without changing old fields, forecasts or absent optional fields', () => {
  const old = demoPlan(), raw = JSON.stringify(old), forecasts = forecast(old);
  assert.deepEqual(validatePlan(old), old); assert.ok(!Object.hasOwn(validatePlan(old), 'tagDefinitions'));
  const p = { ...structuredClone(old), tagDefinitions: tagLibrary(old) };
  p.items.filter(i => i.type === 'expense').forEach(i => { i.tags = [{ keyId: p.tagDefinitions[0].id, valueId: p.tagDefinitions[0].values[0].id }]; });
  const saved = validatePlan(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(saved, p);
  const untag = p => { const copy = structuredClone(p); delete copy.tagDefinitions; copy.items.forEach(i => { delete i.tags; }); return copy; };
  assert.deepEqual(untag(saved), old); assert.equal(JSON.stringify(old), raw);
  const withoutEntryTags = rows => rows.map(m => ({ ...m, entries: m.entries.map(i => { const copy = { ...i }; delete copy.tags; return copy; }) }));
  assert.deepEqual(withoutEntryTags(forecast(saved)), forecasts);
});
test('names normalize NFC/trim, count Unicode code points, reserve fallback and reject case duplicates', () => {
  assert.equal(normalizeTagName('  Học tập  '), 'Học tập');
  assert.equal(normalizeTagName('😀'.repeat(40)), '😀'.repeat(40));
  for (const name of ['', '   ', 'KHÁC', ' khác ', '😀'.repeat(41), null, 7]) assert.throws(() => normalizeTagName(name));
  const p = fixture(); p.tagDefinitions[0].name = '  Học tập '; assert.equal(validatePlan(p).tagDefinitions[0].name, 'Học tập');
  assert.throws(() => uniqueTagName(' học TẬP ', [{ id: 'k', name: 'Học tập' }]));
  assert.equal(uniqueTagName('Học tập', [{ id: 'k', name: 'Học tập' }], 'k'), 'Học tập');
});
test('malformed, duplicate, dangling and unsupported tag data fail closed without mutation', () => {
  const mutations = [
    p => { p.tagDefinitions = null; }, p => { p.tagDefinitions[0].extra = true; }, p => { p.tagDefinitions[0].values[0].extra = true; },
    p => { p.tagDefinitions.push({ id: 'other', name: 'DANH MỤC', values: [] }); },
    p => { p.tagDefinitions[0].values[1].name = 'ĂN UỐNG'; }, p => { p.tagDefinitions[0].id = p.items[0].id; },
    p => { p.tagDefinitions[0].values[0].id = p.objects[0].id; }, p => { p.tagDefinitions[1].values[0].id = p.tagDefinitions[0].values[0].id; },
    p => { p.items[0].tags.push(p.items[0].tags[0]); }, p => { p.items[0].tags[0].valueId = 'missing'; },
    p => { p.items[0].tags[0].keyId = 'missing'; }, p => { p.items[0].tags[0].valueId = p.tagDefinitions[1].values[0].id; },
    p => { p.items[0].tags[0].extra = 1; }, p => { p.items[0].tags = {}; }, p => { p.items[0].type = 'income'; },
    p => { delete p.tagDefinitions; }, p => { p.tagDefinitions = Array(501).fill(p.tagDefinitions[0]); },
    p => { p.tagDefinitions[0].values = Array(501).fill(p.tagDefinitions[0].values[0]); }
  ];
  for (const mutate of mutations) { const p = fixture(); mutate(p); const raw = JSON.stringify(p); assert.throws(() => validatePlan(p)); assert.equal(JSON.stringify(p), raw); }
});
test('rename keeps IDs and references; referenced deletion blocks until explicit unassignment', () => {
  const p = fixture(), [key] = p.tagDefinitions, original = structuredClone(p.items);
  key.name = 'Renamed'; key.values[0].name = 'Renamed value'; assert.deepEqual(validatePlan(p).items, original);
  assert.throws(() => removeTagDefinition(p, key.id)); assert.throws(() => removeTagDefinition(p, key.id, key.values[0].id));
  const before = JSON.stringify(p); const unused = removeTagDefinition(p, key.id, key.values[2].id); validatePlan(unused); assert.equal(JSON.stringify(p), before);
  p.items.forEach(i => { i.tags = i.tags?.filter(t => t.keyId !== key.id) ?? []; });
  const removed = validatePlan(removeTagDefinition(p, key.id)); assert.equal(removed.tagDefinitions.length, 1);
});
test('all grouping permutations partition once; fixed recurrence is always the innermost split', () => {
  const p = fixture(), dims = ['object', ...p.tagDefinitions.map(k => `tag:${k.id}`)], before = JSON.stringify(p);
  const permutations = values => values.length ? values.flatMap((v, n) => permutations(values.filter((_, i) => i !== n)).map(rest => [v, ...rest])) : [[]];
  const slots = [[], [''], ['object', '', ''], ...dims.map(d => ['', d, '']), ...permutations(dims), ...dims.flatMap(a => dims.filter(b => b !== a).map(b => [a, b]))];
  for (const selection of slots) {
    const groups = groupExpenses(p, '2026-11', selection), terminal = leaves(groups);
    assert.ok(terminal.every(g => g.dimension === 'type'));
    const ids = terminal.flatMap(g => g.items.map(i => i.id)).sort(); assert.deepEqual(ids, ['i0', 'i1', 'i2', 'i3']);
    for (const leaf of terminal) assert.ok(leaf.items.every(i => i.recurrence.kind === leaf.value));
  }
  const groups = groupExpenses(p, '2026-11', [dims[1], 'object', dims[2]]);
  assert.ok(groups.some(g => g.value === null && g.label === 'Khác'));
  const second = groups.find(g => g.value === p.tagDefinitions[0].values[1].id); assert.equal(second.children[0].children[0].label, 'Khác');
  assert.ok(groupExpenses(p, '2026-11').some(g => g.value === 'empty' && g.items.length === 0));
  assert.equal(JSON.stringify(p), before);
  assert.throws(() => activeDimensions(['object', 'object'], p.tagDefinitions)); assert.throws(() => activeDimensions(['bad'], p.tagDefinitions));
  assert.throws(() => activeDimensions(['', '', '', ''], p.tagDefinitions));
});
test('month/search/all-schedule projections never invent occurrences or change summary/history', () => {
  const p = fixture(), before = JSON.stringify(p), summary = forecast(p);
  assert.equal(leaves(groupExpenses(p, '2026-12')).flatMap(g => g.items).length, 2);
  assert.equal(leaves(groupExpenses(p, '2026-12', [], { allSchedules: true })).flatMap(g => g.items).length, 4);
  assert.deepEqual(leaves(groupExpenses(p, '2026-11', [], { search: 'Expense 2' })).flatMap(g => g.items.map(i => i.id)), ['i2']);
  assert.deepEqual(forecast(p), summary); assert.equal(JSON.stringify(p), before);
  const revised = reviseEstimate(reviseEstimate(p, 'i0', '2027-01', 3200000), 'i0', '2026-12', 3100000);
  assert.deepEqual(['2026-11', '2026-12', '2027-01'].map(m => plannedAmount(revised.items[0], m)), [null, 3100000, 3200000]);
  revised.items[0].recurrence.end = '2026-12'; assert.throws(() => validatePlan(revised));
});
