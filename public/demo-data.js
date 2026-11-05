// Fictional learning data only. Fixed dates and literal integer VND; no private
// data, clock, random IDs, model imports or external requests belong here.
const monthly = { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 };
const once = month => ({ kind: 'once', anchor: month, end: month, everyMonths: 1 });
const item = (id, objectId, name, type, amount, recurrence = monthly, changes = {}) => ({
  id, objectId, name, description: 'Dữ liệu hư cấu để học và khám phá ứng dụng.',
  type, status: 'confirmed', amount, recurrence, amountChanges: [], ...changes
});
const seed = {
  version: 3, currency: 'VND', name: 'Gia đình mẫu Minh – Lan', demo: true,
  startMonth: '2026-11', endMonth: '2027-12',
  objects: [
    { id: 'minh', type: 'person', name: 'Minh (chồng · mẫu)' },
    { id: 'lan', type: 'person', name: 'Lan (vợ · mẫu)' },
    { id: 'an', type: 'person', name: 'An (con · mẫu)' },
    { id: 'binh', type: 'person', name: 'Bình (con · mẫu)' },
    { id: 'family', type: 'group', name: 'Gia đình (mẫu)' },
    { id: 'housing', type: 'category', name: 'Nhà ở' },
    { id: 'living', type: 'category', name: 'Sinh hoạt' },
    { id: 'transport', type: 'category', name: 'Đi lại' },
    { id: 'reserve', type: 'category', name: 'Dự phòng' }
  ],
  items: [
    item('minh-income', 'minh', 'Thu nhập Minh', 'income', 25000000),
    item('lan-income', 'lan', 'Thu nhập Lan', 'income', 18000000),
    item('rent', 'housing', 'Tiền thuê nhà', 'expense', 8000000),
    item('groceries', 'living', 'Thực phẩm', 'expense', 6000000),
    item('utilities', 'living', 'Điện nước', 'expense', 1500000, monthly,
      { amountChanges: [{ month: '2027-01', amount: 1800000 }] }),
    item('travel', 'transport', 'Đi lại hằng tháng', 'expense', 2000000),
    item('minh-lunch', 'minh', 'Ăn trưa Minh', 'expense', 1200000),
    item('lan-lunch', 'lan', 'Ăn trưa Lan', 'expense', 1200000),
    item('an-school', 'an', 'Học phí An', 'expense', 3000000),
    item('an-activities', 'an', 'Hoạt động An', 'expense', 600000),
    item('binh-kindergarten', 'binh', 'Mẫu giáo Bình', 'expense', 2500000),
    item('binh-activities', 'binh', 'Hoạt động Bình', 'expense', 400000),
    item('insurance', 'family', 'Bảo hiểm gia đình', 'expense', 6000000,
      { kind: 'interval', anchor: '2026-11', end: '2027-11', everyMonths: 12 }),
    item('school-supplies', 'an', 'Đồ dùng học tập An', 'expense', 1200000, once('2027-08')),
    item('dental', 'binh', 'Nha khoa Bình (chưa biết giá)', 'expense', null, once('2026-12')),
    item('free-activity', 'family', 'Hoạt động miễn phí', 'expense', 0, once('2026-11')),
    item('holiday', 'reserve', 'Du lịch đang cân nhắc', 'expense', 8000000, once('2027-06'), { status: 'tentative' }),
    item('repayment', 'family', 'Kế hoạch trả nợ', 'expense', 2000000),
    item('collection', 'minh', 'Kế hoạch thu hồi cho mượn', 'income', 500000, once('2026-12'))
  ],
  accounts: [{ id: 'wallet', name: 'Ví mẫu' }, { id: 'bank', name: 'Ngân hàng mẫu' }],
  snapshots: [
    { id: 'wallet-oct', accountId: 'wallet', date: '2026-10-15', amount: 2000000 },
    { id: 'wallet-nov', accountId: 'wallet', date: '2026-11-01', amount: 3000000 },
    { id: 'bank-nov', accountId: 'bank', date: '2026-11-01', amount: 47000000 }
  ],
  debtAccounts: [
    { id: 'loan', name: 'Khoản vay mẫu', direction: 'payable' },
    { id: 'lent', name: 'Khoản cho mượn mẫu', direction: 'receivable' }
  ],
  debtSnapshots: [
    { id: 'loan-nov', accountId: 'loan', date: '2026-11-01', amount: 30000000 },
    { id: 'lent-nov', accountId: 'lent', date: '2026-11-01', amount: 3000000 }
  ]
};
// Never expose the shared seed: all nested arrays/records are independent.
export function createDemoData() { return structuredClone(seed); }
