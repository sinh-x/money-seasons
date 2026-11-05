// Optional v3 expense tags. View projections never materialize fields in a plan.
import { occurs } from './legacy-model.js';

export const CATEGORY_STARTERS = Object.freeze(['Ăn uống', 'Vui chơi', 'Học tập', 'Du lịch / về quê', 'Hiếu hỷ', 'Nhà cửa', 'Quần áo', 'Chăm sóc sức khỏe', 'Từ thiện', 'Đầu tư', 'Bảo vệ tài chính', 'Trả nợ']);
export const OBJECT_DIMENSION = 'object';
const fail = message => { throw new Error(message); };
const own = (value, key) => Object.hasOwn(value, key);
function shape(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) || fields.some(k => !own(value, k))) fail('Trường thẻ không hợp lệ.');
}
export function normalizeTagName(value) {
  if (typeof value !== 'string') fail('Tên thẻ cần là văn bản.');
  const name = value.normalize('NFC').trim();
  if (![...name].length || [...name].length > 40 || name.toLocaleLowerCase('vi') === 'khác') fail('Tên thẻ cần 1–40 ký tự; Khác dành cho nhóm chưa gán thẻ.');
  return name;
}
const folded = value => normalizeTagName(value).toLocaleLowerCase('vi');
export function uniqueTagName(name, siblings, exceptId) {
  const normalized = normalizeTagName(name);
  if (siblings.some(s => s.id !== exceptId && folded(s.name) === folded(normalized))) fail('Tên thẻ hoặc giá trị đã tồn tại.');
  return normalized;
}
// Called on the cloned plan by the shared browser/server validator. IDs share
// the plan-wide namespace; assignments are references, not new identities.
export function validateExpenseTags(plan, identify) {
  const definitions = own(plan, 'tagDefinitions') ? plan.tagDefinitions : [];
  if (!Array.isArray(definitions) || definitions.length > 500) fail('Thư viện thẻ không hợp lệ.');
  const names = new Set(), keys = new Map();
  for (const key of definitions) {
    shape(key, ['id', 'name', 'values']); identify(key);
    key.name = normalizeTagName(key.name);
    if (names.has(folded(key.name))) fail('Tên khóa thẻ phải duy nhất.');
    names.add(folded(key.name)); keys.set(key.id, key);
    if (!Array.isArray(key.values) || key.values.length > 500) fail('Danh sách giá trị thẻ không hợp lệ.');
    const values = new Set();
    for (const value of key.values) {
      shape(value, ['id', 'name']); identify(value); value.name = normalizeTagName(value.name);
      if (values.has(folded(value.name))) fail('Tên giá trị thẻ phải duy nhất trong khóa.');
      values.add(folded(value.name));
    }
  }
  for (const item of plan.items) {
    if (!own(item, 'tags')) continue;
    if (item.type !== 'expense' || !Array.isArray(item.tags) || item.tags.length > 500) fail('Chỉ khoản chi có danh sách thẻ.');
    const assigned = new Set();
    for (const tag of item.tags) {
      shape(tag, ['keyId', 'valueId']);
      if (typeof tag.keyId !== 'string' || typeof tag.valueId !== 'string' || assigned.has(tag.keyId) || !keys.get(tag.keyId)?.values.some(v => v.id === tag.valueId)) fail('Mỗi khóa chỉ có một giá trị hợp lệ; không được tham chiếu thẻ đã xóa.');
      assigned.add(tag.keyId);
    }
  }
}
export function tagLibrary(plan) {
  if (own(plan, 'tagDefinitions')) return structuredClone(plan.tagDefinitions);
  // Deterministic, collision-safe starter identities; viewing never saves them.
  const ids = new Set();
  for (const list of ['objects', 'items', 'accounts', 'snapshots', 'debtAccounts', 'debtSnapshots']) for (const entity of plan[list] ?? []) ids.add(entity.id);
  const allocate = base => { let id = base, suffix = 0; while (ids.has(id)) id = `${base}-${++suffix}`; ids.add(id); return id; };
  return [['Danh mục', CATEGORY_STARTERS], ['Mức cần thiết', ['Thiết yếu', 'Tùy chọn']]].map(([name, values], n) => ({ id: allocate(`expense-tag-${n + 1}`), name,
    values: values.map((value, i) => ({ id: allocate(`expense-tag-${n + 1}-value-${i + 1}`), name: value })) }));
}
export function removeTagDefinition(plan, keyId, valueId) {
  const next = structuredClone(plan), library = tagLibrary(next), key = library.find(k => k.id === keyId);
  if (!key) fail('Không tìm thấy khóa thẻ.');
  if (next.items.some(i => i.tags?.some(t => t.keyId === keyId && (valueId === undefined || t.valueId === valueId)))) fail('Thẻ đang được dùng; hãy gỡ gán trước khi xóa.');
  if (valueId === undefined) next.tagDefinitions = library.filter(k => k.id !== keyId);
  else { key.values = key.values.filter(v => v.id !== valueId); next.tagDefinitions = library; }
  return next;
}
export function activeDimensions(slots, definitions) {
  if (!Array.isArray(slots) || slots.length > 3) fail('Chỉ có tối đa ba cấp nhóm.');
  const active = slots.filter(Boolean);
  if (new Set(active).size !== active.length || active.some(s => s !== OBJECT_DIMENSION && !definitions.some(k => `tag:${k.id}` === s))) fail('Chọn các cấp nhóm khác nhau.');
  return active;
}
// Every row follows exactly one branch per dimension. Missing assignments use a
// virtual null identity, never a stored "Khác" definition. Type is always last.
export function groupExpenses(plan, month, slots = [OBJECT_DIMENSION, '', ''], { allSchedules = false, search = '' } = {}) {
  const definitions = tagLibrary(plan), dimensions = activeDimensions(slots, definitions);
  const query = search.normalize('NFC').trim().toLocaleLowerCase('vi');
  const items = plan.items.filter(i => i.type === 'expense' && (allSchedules || occurs(i, month)) && (!query || `${i.name} ${i.description}`.normalize('NFC').toLocaleLowerCase('vi').includes(query)));
  function partition(rows, level, path) {
    const dimension = dimensions[level];
    if (!dimension) return ['interval', 'once'].map(kind => ({ dimension: 'type', value: kind, label: kind === 'once' ? 'Một lần' : 'Lặp lại', path: [...path, ['type', kind]], items: rows.filter(i => i.recurrence.kind === kind), children: [] }));
    const key = definitions.find(k => `tag:${k.id}` === dimension);
    const identity = i => dimension === OBJECT_DIMENSION ? i.objectId : i.tags?.find(t => t.keyId === key.id)?.valueId ?? null;
    const values = [...new Set(rows.map(identity))];
    if (level === 0 && dimension === OBJECT_DIMENSION && !query) for (const o of plan.objects) if (!values.includes(o.id)) values.push(o.id);
    return values.map(value => {
      const members = rows.filter(i => identity(i) === value), branch = [...path, [dimension, value]];
      return { dimension, value, label: dimension === OBJECT_DIMENSION ? plan.objects.find(o => o.id === value).name : key.values.find(v => v.id === value)?.name ?? 'Khác', path: branch,
        items: members, children: partition(members, members.length ? level + 1 : dimensions.length, branch) };
    });
  }
  return partition(items, 0, []);
}
