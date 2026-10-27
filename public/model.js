// Pure monthly model. VND values are whole, bounded integers; null means unknown.
export const MAX_AMOUNT = 1_000_000_000_000;
export const MONTHS = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
const validAmount = n => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_AMOUNT);
const validMonth = n => Number.isInteger(n) && n >= 1 && n <= 12;
const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

export function validatePlan(p) {
  const fail = () => { throw new Error('Tệp kế hoạch không hợp lệ hoặc phiên bản chưa được hỗ trợ. Dữ liệu hiện tại được giữ nguyên.'); };
  if (!p || p.version !== 1 || p.currency !== 'VND' || !Number.isInteger(p.year) || p.year < 2000 || p.year > 2100 ||
      !text(p.name, 80) || !validAmount(p.openingCash) || typeof p.demo !== 'boolean' ||
      !Array.isArray(p.items) || p.items.length > 500) fail();
  const ids = new Set();
  for (const i of p.items) {
    if (!i || !text(i.id, 80) || ids.has(i.id) || !text(i.name, 100) || !['income', 'expense'].includes(i.type) ||
        !['confirmed', 'tentative'].includes(i.status) || !['once', 'monthly'].includes(i.repeat) ||
        !validMonth(i.start) || !validMonth(i.end) || i.end < i.start || (i.repeat === 'once' && i.end !== i.start) ||
        !validAmount(i.amount) || typeof i.category !== 'string' || i.category.length > 40 ||
        !i.actuals || typeof i.actuals !== 'object' || Array.isArray(i.actuals)) fail();
    ids.add(i.id);
    for (const [month, amount] of Object.entries(i.actuals)) {
      if (!/^(?:[1-9]|1[0-2])$/.test(month) || Number(month) < i.start || Number(month) > i.end || !validAmount(amount) || amount === null) fail();
    }
  }
  // Copy only supported fields. Never retain arbitrary imported keys.
  return {
    version: 1, currency: 'VND', year: p.year, name: p.name.trim(), openingCash: p.openingCash, demo: p.demo,
    items: p.items.map(i => ({ id: i.id, name: i.name.trim(), type: i.type, status: i.status, repeat: i.repeat,
      start: i.start, end: i.end, amount: i.amount, category: i.category, actuals: { ...i.actuals } }))
  };
}

export function occurs(item, month) {
  return month >= item.start && month <= item.end;
}

export function forecast(plan, includeTentative = false) {
  let balance = plan.openingCash ?? 0;
  let incomplete = plan.openingCash === null;
  return MONTHS.map((label, index) => {
    const month = index + 1;
    const entries = plan.items.filter(i => occurs(i, month)).map(item => {
      const actual = item.actuals[month];
      // Recorded cash always counts, even if the original plan was tentative.
      const included = item.status === 'confirmed' || includeTentative || actual !== undefined;
      return { ...item, actual, effective: actual ?? item.amount, included };
    });
    const active = entries.filter(i => i.included);
    const missing = active.filter(i => i.effective === null).length;
    incomplete ||= missing > 0;
    const income = active.filter(i => i.type === 'income').reduce((n, i) => n + (i.effective ?? 0), 0);
    const expense = active.filter(i => i.type === 'expense').reduce((n, i) => n + (i.effective ?? 0), 0);
    const opening = balance;
    balance += income - expense;
    if (!Number.isSafeInteger(balance)) throw new Error('Tổng số tiền vượt giới hạn tính toán.');
    return { month, label, opening, income, expense, net: income - expense, closing: balance, incomplete, missing, entries };
  });
}

export function blankPlan(year = new Date().getFullYear()) {
  return { version: 1, currency: 'VND', year, name: 'Kế hoạch của tôi', openingCash: null, demo: false, items: [] };
}

export function demoPlan() {
  const item = (id, name, type, amount, start, end, category, status = 'confirmed', actuals = {}) =>
    ({ id, name, type, amount, start, end, category, status, actuals, repeat: start === end ? 'once' : 'monthly' });
  return {
    version: 1, currency: 'VND', year: 2027, name: 'Một năm an tâm', openingCash: 20_000_000, demo: true,
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
    ]
  };
}
