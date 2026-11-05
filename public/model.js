// Active v3 monthly planning model: snapshots + plans, never transactions/actuals.
import * as legacy from './legacy-model.js';
import { createDemoData } from './demo-data.js';
export { MAX_AMOUNT, MAX_BYTES, MONTHS, monthIndex, monthKey, monthRange, occurs, plannedAmount } from './legacy-model.js';
import { MAX_AMOUNT, MAX_BYTES, monthRange, monthIndex, monthKey, occurs, plannedAmount } from './legacy-model.js';
const fail = (message = 'Kế hoạch không hợp lệ. Dữ liệu hiện tại được giữ nguyên.') => { throw new Error(message); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max, optional = false) => typeof value === 'string' && value.length <= max && (optional || !!value.trim());
const amount = value => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT);
const exact = value => { if (!Number.isSafeInteger(value)) fail('Tổng số tiền vượt giới hạn tính toán.'); return value; };
function shape(value, fields) {
  if (!record(value) || Object.keys(value).some(key => !fields.split(' ').includes(key))) fail('Trường dữ liệu không được hỗ trợ; không tự xóa dữ liệu.');
}
export function todayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^(20\d\d|2100)-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function blankPlan(startMonth = '2026-11', endMonth = '2027-12') {
  return validatePlan({ version: 3, currency: 'VND', name: 'Kế hoạch gia đình', demo: false, startMonth, endMonth,
    objects: [], items: [], accounts: [], snapshots: [], debtAccounts: [], debtSnapshots: [] });
}
export function validatePlan(source, { today = todayISO() } = {}) {
  shape(source, 'version currency name demo startMonth endMonth objects items accounts snapshots debtAccounts debtSnapshots');
  if (source.version !== 3 || source.currency !== 'VND' || !text(source.name, 80) || typeof source.demo !== 'boolean' || !validDate(today)) fail();
  monthRange(source.startMonth, source.endMonth);
  const p = structuredClone(source), ids = new Set();
  const list = (name, max) => { if (!Array.isArray(p[name]) || p[name].length > max) fail(); return p[name]; };
  function identify(value) {
    if (!text(value.id, 80) || ids.has(value.id)) fail('Mã dữ liệu phải duy nhất.');
    ids.add(value.id);
  }
  for (const o of list('objects', 500)) {
    shape(o, 'id name type'); identify(o);
    if (!text(o.name, 80) || !['person', 'group', 'category'].includes(o.type)) fail();
    o.name = o.name.trim();
  }
  for (const name of ['accounts', 'debtAccounts']) for (const a of list(name, 500)) {
    shape(a, name === 'accounts' ? 'id name' : 'id name direction'); identify(a);
    if (!text(a.name, 80) || (name === 'debtAccounts' && !['payable', 'receivable'].includes(a.direction))) fail();
    a.name = a.name.trim();
  }
  for (const i of list('items', 500)) {
    shape(i, 'id objectId name description type status amount recurrence amountChanges'); identify(i);
    if (!p.objects.some(o => o.id === i.objectId) || !text(i.name, 100) || !text(i.description, 500, true) ||
        !['income', 'expense'].includes(i.type) || !['confirmed', 'tentative'].includes(i.status) || !amount(i.amount)) fail();
    i.name = i.name.trim();
    const r = i.recurrence; shape(r, 'kind anchor end everyMonths');
    const a = monthIndex(r.anchor), b = monthIndex(r.end);
    if (!['once', 'interval'].includes(r.kind) || b < a || !Number.isInteger(r.everyMonths) || r.everyMonths < 1 || r.everyMonths > 120 ||
        (r.kind === 'once' && (a !== b || r.everyMonths !== 1))) fail('Lịch lặp không hợp lệ.');
    // Save the full schedule independently of the forecast window. Only
    // forecast() clips occurrences; changing the view must not discard history.
    if (!Array.isArray(i.amountChanges) || i.amountChanges.length > 120) fail();
    let previous = '';
    for (const c of i.amountChanges) {
      shape(c, 'month amount');
      if (!amount(c.amount) || !occurs(i, c.month) || c.month <= previous) fail('Mốc ước tính phải duy nhất, tăng dần, đúng lịch.');
      previous = c.month;
    }
  }
  for (const [name, accounts] of [['snapshots', p.accounts], ['debtSnapshots', p.debtAccounts]]) {
    const dates = new Set();
    for (const s of list(name, 5000)) {
      shape(s, 'id accountId date amount'); identify(s);
      if (!accounts.some(a => a.id === s.accountId) || !validDate(s.date) || s.date > today || s.amount === null || !amount(s.amount)) fail('Số dư cần ngày hôm nay/lịch sử hợp lệ và số tiền.');
      const key = JSON.stringify([s.accountId, s.date]);
      if (dates.has(key)) fail('Một tài khoản chỉ có một số dư mỗi ngày; cần xác nhận sửa mốc.');
      dates.add(key);
    }
  }
  p.name = p.name.trim();
  if (new TextEncoder().encode(JSON.stringify(p)).length > MAX_BYTES) fail('Kế hoạch vượt 1 MB.');
  forecast(p); forecast(p, true);
  // Debt sums also must be exact, independently of cash.
  for (const month of monthRange(p.startMonth, p.endMonth)) { debtTotal(p, 'payable', month); debtTotal(p, 'receivable', month); }
  return p;
}
export function latestSnapshot(snapshots, accountId, month) {
  return snapshots.filter(s => s.accountId === accountId && s.date.slice(0, 7) <= month)
    .reduce((latest, s) => !latest || s.date > latest.date ? s : latest, null);
}
export function cashBaseline(p, month) {
  const references = p.accounts.map(a => ({ ...a, snapshot: latestSnapshot(p.snapshots, a.id, month) }));
  return { known: references.reduce((n, a) => exact(n + (a.snapshot?.amount ?? 0)), 0),
    missing: references.length ? references.filter(a => !a.snapshot).length : 1, references };
}
export function debtTotal(p, direction, month) {
  return p.debtAccounts.filter(a => a.direction === direction).reduce((out, a) => {
    const s = latestSnapshot(p.debtSnapshots, a.id, month);
    if (s) out.known = exact(out.known + s.amount); else out.missing++;
    return out;
  }, { known: 0, missing: 0 });
}
export function forecast(p, includeTentative = false) {
  let balance = 0, incomplete = true, totalIncome = 0, totalExpense = 0;
  return monthRange(p.startMonth, p.endMonth).map((month, index) => {
    const base = cashBaseline(p, month), fresh = p.snapshots.some(s => s.date.slice(0, 7) === month), reset = index === 0 || fresh;
    if (reset) { balance = base.known; incomplete = base.missing > 0; }
    const openingIncomplete = incomplete, opening = balance;
    const entries = p.items.filter(i => occurs(i, month)).map(i => ({ ...i, planned: plannedAmount(i, month), effective: plannedAmount(i, month), included: i.status === 'confirmed' || includeTentative }));
    const active = entries.filter(i => i.included), missing = active.filter(i => i.effective === null).length;
    const sum = type => active.filter(i => i.type === type).reduce((n, i) => exact(n + (i.effective ?? 0)), 0);
    const income = sum('income'), expense = sum('expense');
    const incomeMissing = active.filter(i => i.type === 'income' && i.effective === null).length;
    const expenseMissing = active.filter(i => i.type === 'expense' && i.effective === null).length;
    totalIncome = exact(totalIncome + income); totalExpense = exact(totalExpense + expense);
    incomplete ||= missing > 0;
    balance = exact(exact(balance + income) - expense);
    return { month, opening, openingIncomplete, income, expense, net: exact(income - expense), closing: balance, incomplete, missing, incomeMissing, expenseMissing, entries, reset, fresh, references: base.references, missingAccounts: base.missing };
  });
}
// Choose a real occurrence for editing even when no occurrence is in the window.
// Prefer the first at/after the reference; after the schedule, use its final one.
export function estimateMonth(item, reference) {
  const r = item.recurrence, first = monthIndex(r.anchor), step = r.everyMonths;
  const last = r.kind === 'once' ? first : first + Math.floor((monthIndex(r.end) - first) / step) * step;
  const next = first + Math.ceil(Math.max(0, monthIndex(reference) - first) / step) * step;
  return monthKey(Math.min(next, last));
}
export function changeWindow(p, startMonth, endMonth) { return validatePlan({ ...p, startMonth, endMonth }); }
export function reviseEstimate(p, id, month, value) {
  if (!amount(value)) fail();
  const next = structuredClone(p), item = next.items.find(i => i.id === id);
  if (!item || !occurs(item, month)) fail('Tháng hiệu lực phải thuộc lịch.');
  item.amountChanges = [...item.amountChanges.filter(c => c.month !== month), { month, amount: value }].sort((a, b) => a.month.localeCompare(b.month));
  return validatePlan(next);
}
export function setSnapshot(p, snapshot, { debt = false, confirmed = false } = {}) {
  const next = structuredClone(p), list = debt ? next.debtSnapshots : next.snapshots;
  const index = list.findIndex(s => s.accountId === snapshot.accountId && s.date === snapshot.date);
  if (index >= 0) {
    if (!confirmed) fail('Cần xác nhận thay số dư cùng ngày.');
    list[index] = { ...snapshot, id: list[index].id };
  } else list.push(snapshot);
  return validatePlan(next);
}
// No automatic migration: caller must retain/export raw original and disclose actual exclusion.
export function convertLegacy(source, { confirmed = false } = {}) {
  if (!confirmed) fail('Cần lưu nguyên bản và xác nhận không dùng thực tế cũ trong kế hoạch mới.');
  const old = source.version === 1 ? legacy.migrateV1(source) : legacy.validatePlan(source);
  const p = blankPlan(old.startMonth, old.endMonth); p.name = old.name; p.demo = old.demo;
  for (const i of old.items) {
    // Equal text is not identity. Give each legacy detail a separately identified
    // object; the preview exposes this conservative mapping for explicit review.
    const name = i.personLabel.trim() || i.category.trim() || 'Kế hoạch cũ';
    let objectId = `legacy-object-${p.objects.length + 1}`;
    while (old.items.some(i => i.id === objectId)) objectId += '-';
    p.objects.push({ id: objectId, name, type: 'category' });
    p.items.push({ id: i.id, objectId, name: i.name, description: [i.category, i.personLabel].filter(Boolean).join(' · '), type: i.type, status: i.status,
      amount: i.amount, recurrence: i.recurrence, amountChanges: i.amountChanges });
  }
  // Opening cash has no account/reference date. Leave unknown, never fabricate a snapshot.
  return validatePlan(p);
}
export function demoPlan() { return validatePlan(createDemoData()); }
