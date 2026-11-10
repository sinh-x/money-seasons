// Pure monthly model. Whole VND; null is unknown, never zero.
export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_BYTES = 1_000_000;
export const MONTHS = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
const amount = n => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_AMOUNT);
const text = (s, max, optional = false) => typeof s === 'string' && s.length <= max && (optional || s.trim().length > 0);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = (message = 'Kế hoạch không hợp lệ. Dữ liệu hiện tại được giữ nguyên.') => { throw new Error(message); };
const exact = n => { if (!Number.isSafeInteger(n)) fail('Tổng số tiền vượt giới hạn tính toán.'); return n; };

export function monthIndex(month) {
  if (typeof month !== 'string' || !/^(20\d\d|2100)-(0[1-9]|1[0-2])$/.test(month)) fail('Tháng phải trong khoảng 2000-01 đến 2100-12.');
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}
export function monthKey(index) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function monthRange(start, end, max = 120) {
  const a = monthIndex(start), b = monthIndex(end);
  if (b < a || b - a + 1 > max) fail('Kỳ kế hoạch phải có từ 1 đến 120 tháng liên tiếp.');
  return Array.from({ length: b - a + 1 }, (_, n) => monthKey(a + n));
}
export function occurs(item, month) {
  const n = monthIndex(month), r = item.recurrence, a = monthIndex(r.anchor);
  return n >= a && n <= monthIndex(r.end) && (r.kind === 'once' ? n === a : (n - a) % r.everyMonths === 0);
}
export function plannedAmount(item, month) {
  let value = item.amount;
  for (const change of item.amountChanges) {
    if (change.month > month) break;
    value = change.amount;
  }
  return value;
}

export function validatePlan(p) {
  if (!record(p) || p.version !== 2 || p.currency !== 'VND' || !text(p.name, 80) || !amount(p.openingCash) ||
      typeof p.demo !== 'boolean' || !Array.isArray(p.items) || p.items.length > 500) fail();
  monthRange(p.startMonth, p.endMonth);
  const ids = new Set();
  const items = p.items.map(i => {
    if (!record(i) || !text(i.id, 80) || ids.has(i.id) ||
        !text(i.name, 100) || !['income', 'expense'].includes(i.type) || !['confirmed', 'tentative'].includes(i.status) ||
        !amount(i.amount) || !text(i.category, 40, true) || !text(i.personLabel, 80, true) ||
        !record(i.recurrence) || !record(i.actuals) || !Array.isArray(i.amountChanges) || i.amountChanges.length > 120) fail();
    ids.add(i.id);
    const r = i.recurrence;
    const a = monthIndex(r.anchor), b = monthIndex(r.end);
    if (!['once', 'interval'].includes(r.kind) || b < a || !Number.isInteger(r.everyMonths) ||
        r.everyMonths < 1 || r.everyMonths > 120 || (r.kind === 'once' && (a !== b || r.everyMonths !== 1))) fail();
    const last = r.kind === 'once' ? a : a + Math.floor((b - a) / r.everyMonths) * r.everyMonths;
    if (a < monthIndex(p.startMonth) || last > monthIndex(p.endMonth)) fail('Khoảng tháng loại bỏ lần thu chi. Hãy sửa lịch trước.');
    let previous = '';
    const amountChanges = i.amountChanges.map(c => {
      if (!record(c) || !amount(c.amount) || !occurs(i, c.month) || c.month <= previous) fail('Lịch sử dự kiến phải có tháng hiệu lực duy nhất, theo thứ tự và đúng lần lặp.');
      previous = c.month;
      return { month: c.month, amount: c.amount };
    });
    const actuals = {};
    for (const [month, value] of Object.entries(i.actuals)) {
      if (!occurs(i, month) || !amount(value) || value === null) fail('Số thực tế phải thuộc đúng lần thu chi.');
      actuals[month] = value;
    }
    return { id: i.id, name: i.name.trim(), type: i.type, status: i.status, amount: i.amount,
      category: i.category, personLabel: i.personLabel,
      recurrence: { kind: r.kind, anchor: r.anchor, end: r.end, everyMonths: r.everyMonths }, amountChanges, actuals };
  });
  const clean = { version: 2, currency: 'VND', name: p.name.trim(), demo: p.demo,
    startMonth: p.startMonth, endMonth: p.endMonth, openingCash: p.openingCash, items };
  // Check both comparisons, including period totals, before any caller replaces state.
  forecast(clean); forecast(clean, true);
  return clean;
}

export function forecast(plan, includeTentative = false) {
  let balance = plan.openingCash ?? 0, incomplete = plan.openingCash === null;
  let totalIncome = 0, totalExpense = 0;
  return monthRange(plan.startMonth, plan.endMonth).map(month => {
    const entries = plan.items.filter(i => occurs(i, month)).map(item => {
      const actual = item.actuals[month], planned = plannedAmount(item, month);
      return { ...item, planned, actual, effective: actual ?? planned,
        included: item.status === 'confirmed' || includeTentative || actual !== undefined };
    });
    const active = entries.filter(i => i.included);
    const missing = active.filter(i => i.effective === null).length;
    incomplete ||= missing > 0;
    const sum = type => active.filter(i => i.type === type).reduce((n, i) => exact(n + (i.effective ?? 0)), 0);
    const income = sum('income'), expense = sum('expense'), opening = balance;
    totalIncome = exact(totalIncome + income); totalExpense = exact(totalExpense + expense);
    const net = exact(income - expense);
    balance = exact(exact(opening + income) - expense);
    return { month, label: `${MONTHS[Number(month.slice(5)) - 1]} · ${month.slice(0, 4)}`,
      opening, income, expense, net, closing: balance, incomplete, missing, entries };
  });
}

export function blankPlan(startMonth = '2026-11', endMonth = '2027-12') {
  return validatePlan({ version: 2, currency: 'VND', name: 'Kế hoạch của tôi', openingCash: null,
    demo: false, startMonth, endMonth, items: [] });
}

export function changeWindow(plan, startMonth, endMonth, opening) {
  if (startMonth !== plan.startMonth && opening === undefined) fail('Đổi tháng đầu cần xác nhận số tiền đầu kỳ mới hoặc chưa biết.');
  return validatePlan({ ...plan, startMonth, endMonth, openingCash: opening === undefined ? plan.openingCash : opening });
}

export function reviseEstimate(plan, id, month, value) {
  if (!amount(value)) fail();
  const next = structuredClone(plan), item = next.items.find(i => i.id === id);
  if (!item || !occurs(item, month)) fail('Tháng hiệu lực phải là một lần thu chi trong lịch.');
  item.amountChanges = [...item.amountChanges.filter(c => c.month !== month), { month, amount: value }].sort((a, b) => a.month.localeCompare(b.month));
  return validatePlan(next);
}

// Explicit conversion only: keep the original browser key/export; never reinterpret its opening date.
export function validateLegacyPlan(p) {
  const vm = n => Number.isInteger(n) && n >= 1 && n <= 12;
  if (!record(p) || p.version !== 1 || p.currency !== 'VND' || !Number.isInteger(p.year) || p.year < 2000 || p.year > 2100 ||
      !text(p.name, 80) || !amount(p.openingCash) || typeof p.demo !== 'boolean' || !Array.isArray(p.items) || p.items.length > 500) fail();
  const ids = new Set();
  for (const i of p.items) {
    if (!record(i) || !text(i.id, 80) || ids.has(i.id) || !text(i.name, 100) || !['income', 'expense'].includes(i.type) ||
        !['confirmed', 'tentative'].includes(i.status) || !['once', 'monthly'].includes(i.repeat) ||
        !vm(i.start) || !vm(i.end) || i.end < i.start || (i.repeat === 'once' && i.end !== i.start) ||
        !amount(i.amount) || !text(i.category, 40, true) || !record(i.actuals)) fail();
    ids.add(i.id);
    for (const [m, value] of Object.entries(i.actuals)) {
      if (!/^(?:[1-9]|1[0-2])$/.test(m) || Number(m) < i.start || Number(m) > i.end || !amount(value) || value === null) fail();
    }
  }
  return { version: 1, currency: 'VND', year: p.year, name: p.name.trim(), openingCash: p.openingCash, demo: p.demo,
    items: p.items.map(i => ({ id: i.id, name: i.name.trim(), type: i.type, status: i.status, repeat: i.repeat,
      start: i.start, end: i.end, amount: i.amount, category: i.category, actuals: { ...i.actuals } })) };
}
export function migrateV1(source) {
  const p = validateLegacyPlan(source), key = m => `${p.year}-${String(m).padStart(2, '0')}`;
  return validatePlan({ version: 2, currency: 'VND', name: p.name, demo: p.demo, openingCash: p.openingCash,
    startMonth: key(1), endMonth: key(12), items: p.items.map(i => ({ id: i.id, name: i.name, type: i.type,
      status: i.status, amount: i.amount, category: i.category, personLabel: '', amountChanges: [],
      recurrence: { kind: i.repeat === 'once' ? 'once' : 'interval', anchor: key(i.start), end: key(i.end), everyMonths: 1 },
      actuals: Object.fromEntries(Object.entries(i.actuals).map(([m, v]) => [key(m), v])) })) });
}

export function demoPlan() {
  const item = (id, name, type, amount, start, end, category, status = 'confirmed', actuals = {}) =>
    ({ id, name, type, amount, start, end, category, status, actuals, repeat: start === end ? 'once' : 'monthly' });
  return migrateV1({ version: 1, currency: 'VND', year: 2027, name: 'Một năm an tâm', openingCash: 20_000_000, demo: true,
    items: [
      item('salary', 'Thu nhập gia đình', 'income', 30_000_000, 1, 12, 'Thu nhập'),
      item('living', 'Sinh hoạt & thực phẩm', 'expense', 12_000_000, 1, 12, 'Sinh hoạt', 'confirmed', { 1: 13_500_000 }),
      item('home', 'Tiền nhà', 'expense', 8_000_000, 1, 12, 'Nhà cửa'),
      item('repayment', 'Trả khoản vay', 'expense', 4_000_000, 1, 12, 'Khoản vay'),
      item('tet', 'Tết & quà cho gia đình', 'expense', 20_000_000, 2, 2, 'Gia đình'),
      item('insurance', 'Bảo hiểm hằng năm', 'expense', 24_000_000, 4, 4, 'Sức khỏe'),
      item('tuition', 'Học phí đầu năm học', 'expense', 36_000_000, 9, 9, 'Học tập'),
      item('bonus', 'Thưởng cuối năm', 'income', 25_000_000, 12, 12, 'Thu nhập'),
      item('trip', 'Chuyến đi mùa hè', 'expense', 18_000_000, 7, 7, 'Trải nghiệm', 'tentative'),
      item('repair', 'Bảo dưỡng xe', 'expense', null, 11, 11, 'Đi lại')
    ] });
}
