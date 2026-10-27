import { MONTHS, MAX_AMOUNT, demoPlan, blankPlan, validatePlan, forecast } from './model.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'money-seasons.plan.v1';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => value === null ? 'Chưa biết' : `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const short = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / 1_000_000)} tr`;
let plan = demoPlan();
let view = 'year';
let selectedMonth = 1;
let editingId = null;
let actualId = null;
let setupNew = false;
let confirmAction;
let toastTimer;

function storageWarning(message) {
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = !message;
}
try {
  const saved = localStorage.getItem(KEY);
  if (saved) plan = validatePlan(JSON.parse(saved));
} catch {
  storageWarning('Không đọc được dữ liệu đã lưu. Đang hiển thị mẫu tạm thời; chưa thay thế dữ liệu cũ. Hãy kiểm tra bản sao trước khi lưu thay đổi.');
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function commit(next, message = 'Đã lưu trên trình duyệt này.') {
  const valid = validatePlan(next);
  forecast(valid, true); // Check arithmetic bounds before replacing any existing state.
  plan = valid;
  let saved = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
    storageWarning('');
  } catch {
    saved = false;
    storageWarning('Không lưu được trên trình duyệt. Thay đổi chỉ ở phiên đang mở và có thể mất khi tải lại. Hãy xuất kế hoạch ngay để giữ bản sao.');
  }
  render();
  toast(saved ? message : 'Chưa lưu được. Hãy xuất bản sao trước khi đóng trang.');
}

function show(id) { if (!$(id).open) $(id).showModal(); }
function confirmChange(title, message, action) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  confirmAction = action;
  show('#confirm-dialog');
}
const months = () => forecast(plan, $('#include-tentative').checked);
const amountInput = value => {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_AMOUNT) throw new Error('Nhập số đồng nguyên từ 0 đến 1.000.000.000.000, hoặc để trống nếu chưa biết.');
  return n;
};

function render() {
  const data = months();
  const income = data.reduce((n, m) => n + m.income, 0);
  const expense = data.reduce((n, m) => n + m.expense, 0);
  const final = data[11];
  $('#plan-title').textContent = plan.name;
  $('#year-label').textContent = plan.year;
  $('#demo-banner').hidden = !plan.demo;
  $('#summary').innerHTML = [
    ['Tiền có sẵn đầu năm', money(plan.openingCash), 'Điểm bắt đầu của kế hoạch', 'opening'],
    ['Tổng thu dự kiến', money(income), 'Tổng các khoản đang được tính', 'income'],
    ['Tổng chi dự kiến', money(expense), final.incomplete ? 'Chưa gồm số tiền còn thiếu' : 'Gồm các khoản đã biết', 'expense'],
    ['Còn lại cuối năm', money(final.closing), final.incomplete ? 'Ước tính chưa đủ dữ liệu' : 'Sau các khoản thu & chi', final.closing < 0 ? 'negative' : 'closing']
  ].map(([title, value, caption, kind]) => `<article class="summary-card ${kind}"><p>${title}<span aria-hidden="true">${kind === 'income' ? '↙' : kind === 'expense' ? '↗' : '◌'}</span></p><strong>${value}</strong><small>${caption}</small></article>`).join('');
  $('#empty-note').hidden = plan.items.length > 0;
  $('#months').hidden = view !== 'year';
  $('#all-items').hidden = view !== 'items';
  $('#view-eyebrow').textContent = view === 'year' ? '12 THÁNG · MỘT BỨC TRANH' : `${plan.items.length} KHOẢN · CÓ THỂ CHỈNH SỬA`;
  $('#section-title').innerHTML = `${view === 'year' ? 'Bản đồ tài chính' : 'Khoản thu & chi'} <span id="year-label">${plan.year}</span>`;
  $$('.nav-button').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const peak = Math.max(...data.map(m => m.expense), 1);
  $('#months').innerHTML = data.map(m => {
    const special = m.entries.filter(e => e.repeat === 'once' && e.type === 'expense');
    const status = m.closing < 0 ? 'negative' : m.expense > m.income ? 'costly' : 'steady';
    const note = special[0] ? `${special[0].status === 'tentative' ? '≈ Cân nhắc: ' : ''}${special[0].name}` : (plan.items.length ? 'Nhịp chi tiêu thường kỳ' : 'Chưa có khoản thu chi');
    return `<button class="month-card ${status}" data-month="${m.month}" aria-label="Tháng ${m.month}, số dư ${escape(money(m.closing))}${m.incomplete ? ', chưa đủ dữ liệu' : ''}">
      <span class="month-top"><strong>Tháng ${String(m.month).padStart(2, '0')}</strong><span class="season-icon" aria-hidden="true">${['✿', '☀', '❧', '❋'][Math.floor((m.month - 1) / 3)]}</span></span>
      <span class="month-caption">${m.closing < 0 ? '↓ Số dư âm' : m.expense > m.income ? '↗ Chi nhiều hơn thu' : 'Số dư cuối tháng'}</span>
      <strong class="month-balance">${escape(short(m.closing))}<small> ₫</small></strong>
      <meter class="spend-meter" min="0" max="${peak}" value="${m.expense}" aria-label="Chi tháng ${m.month}: ${escape(money(m.expense))}"></meter>
      <span class="month-totals"><span>Thu <b>${escape(short(m.income))}</b></span><span>Chi <b>${escape(short(m.expense))}</b></span></span>
      <span class="month-event">${escape(note)}${special.length > 1 ? ` +${special.length - 1}` : ''}</span>
      ${m.incomplete ? '<span class="incomplete-label">◌ Chưa đủ dữ liệu</span>' : ''}
    </button>`;
  }).join('');
  renderItems();
  renderAttention(data);
  if ($('#month-dialog').open) renderMonth();
}

function renderAttention(data) {
  const peak = data.reduce((best, m) => m.expense > best.expense ? m : best, data[0]);
  const firstNegative = data.find(m => m.closing < 0);
  const missing = plan.items.filter(i => i.amount === null);
  const tentative = plan.items.filter(i => i.status === 'tentative');
  $('#insight').innerHTML = plan.items.length ? `<div class="insight-divider"></div><p class="insight-label">THÁNG CHI NHIỀU NHẤT</p><button class="insight-month" data-month="${peak.month}">Tháng ${peak.month} <span aria-hidden="true">↗</span></button><p class="insight-amount">${escape(money(peak.expense))} <span>đã biết</span></p>` : '<div class="insight-divider"></div><p>Thêm khoản thu chi đầu tiên để bắt đầu.</p>';
  const alerts = [];
  if (plan.openingCash === null) alerts.push('<button class="attention-row" data-setup><span class="alert-symbol">?</span><span><strong>Chưa biết tiền đầu năm</strong><small>Bổ sung để ước tính đầy đủ hơn.</small></span><span>↗</span></button>');
  if (firstNegative) alerts.push(`<button class="attention-row" data-month="${firstNegative.month}"><span class="alert-symbol red">!</span><span><strong>Số dư âm từ tháng ${firstNegative.month}</strong><small>${escape(money(firstNegative.closing))} theo dữ liệu đã biết.</small></span><span>↗</span></button>`);
  if (missing.length) alerts.push(`<button class="attention-row" data-edit="${escape(missing[0].id)}"><span class="alert-symbol">?</span><span><strong>${missing.length} khoản chưa có số tiền</strong><small>${escape(missing[0].name)}${missing.length > 1 ? ' và các khoản khác' : ''}</small></span><span>↗</span></button>`);
  if (tentative.length) alerts.push(`<div class="attention-row"><span class="alert-symbol neutral">≈</span><span><strong>${tentative.length} khoản đang cân nhắc</strong><small>${$('#include-tentative').checked ? 'Đang tính vào ước tính.' : 'Chưa tính, trừ số thực tế đã ghi.'}</small></span></div>`);
  $('#attention-count').textContent = alerts.length;
  $('#attention').innerHTML = alerts.join('') || '<p class="muted small">Chưa có cảnh báo từ dữ liệu đã biết. Số dư tháng không thể hiện khả năng chi trả từng ngày.</p>';
}

function renderItems() {
  $('#all-items').innerHTML = plan.items.length ? `<div class="items-heading"><span>Khoản dự kiến</span><span>Số tiền mỗi lần</span></div>${plan.items.map(i => `<button class="plan-item" data-edit="${escape(i.id)}"><span class="item-symbol ${i.type}">${i.type === 'income' ? '↙' : '↗'}</span><span class="item-description"><strong>${escape(i.name)}</strong><small>${escape(i.category)} · ${i.repeat === 'monthly' ? `Hằng tháng, T${i.start}–T${i.end}` : `Tháng ${i.start}`} ${i.status === 'tentative' ? '· Đang cân nhắc' : ''}</small></span><span class="item-amount">${escape(money(i.amount))}<small>Chỉnh sửa ↗</small></span></button>`).join('')}` : '<p class="empty-state">Kế hoạch còn trống. Bắt đầu bằng một khoản thu hoặc chi.</p>';
}

function openMonth(month) {
  selectedMonth = month;
  renderMonth();
  show('#month-dialog');
}

function renderMonth() {
  const m = months()[selectedMonth - 1];
  $('#month-title').textContent = `Tháng ${selectedMonth} · ${plan.year}`;
  $('#month-eyebrow').textContent = `TIỀN ĐẦU THÁNG: ${money(m.opening)}${m.incomplete ? ' · ƯỚC TÍNH CHƯA ĐỦ' : ''}`;
  $('#month-content').innerHTML = `<div class="month-summary"><div><small>Thu được tính</small><strong>${escape(money(m.income))}</strong></div><div><small>Chi được tính</small><strong>${escape(money(m.expense))}</strong></div><div class="${m.closing < 0 ? 'red-text' : ''}"><small>Còn cuối tháng</small><strong>${escape(money(m.closing))}</strong></div></div>
    ${m.incomplete ? '<p class="warning">Chưa đủ dữ liệu trong tháng này hoặc các tháng trước. Số dư chỉ tính từ các khoản đã biết, không coi tiền còn thiếu là 0 ₫.</p>' : ''}
    ${m.closing < 0 ? '<p class="warning danger-warning">Số dư dự kiến âm. Hãy xem lại thời điểm và quy mô các khoản thu chi.</p>' : ''}
    <div class="month-entries">${m.entries.length ? m.entries.map(i => `<article class="month-entry ${!i.included ? 'excluded' : ''}"><div class="entry-top"><span class="item-symbol ${i.type}">${i.type === 'income' ? '↙' : '↗'}</span><div class="item-description"><strong>${escape(i.name)}</strong><small>${escape(i.category)} · ${i.repeat === 'monthly' ? 'Hằng tháng' : 'Một lần'}${i.status === 'tentative' ? ` · Đang cân nhắc${i.included ? ' (đang tính)' : ' (chưa tính)'}` : ''}</small></div><button class="text-button" data-edit="${escape(i.id)}">Sửa</button></div><div class="entry-amounts"><span>Dự kiến <strong>${escape(money(i.amount))}</strong></span><span>Thực tế <strong>${i.actual === undefined ? 'Chưa ghi' : escape(money(i.actual))}</strong></span>${i.actual !== undefined && i.amount !== null ? `<span>Chênh lệch <strong>${i.actual - i.amount > 0 ? '+' : ''}${escape(money(i.actual - i.amount))}</strong></span>` : ''}<button class="text-button" data-actual="${escape(i.id)}">${i.actual === undefined ? 'Ghi thực tế' : 'Sửa thực tế'} ↗</button></div></article>`).join('') : '<p class="empty-state">Tháng này chưa có khoản thu chi. Bạn có thể thêm ngay bên dưới.</p>'}</div><p class="field-help">Số thực tế thay cho dự kiến, không cộng hai lần. Tiền cuối tháng được chuyển sang tháng sau. Ước tính này không kiểm tra thứ tự thu chi từng ngày.</p>`;
  $('#previous-month').disabled = selectedMonth === 1;
  $('#next-month').disabled = selectedMonth === 12;
}

function openSetup(isNew = false) {
  setupNew = isNew;
  const source = isNew ? blankPlan() : plan;
  const f = $('#setup-form').elements;
  f.name.value = source.name; f.year.value = source.year; f.openingCash.value = source.openingCash ?? '';
  $('#setup-new-warning').hidden = !isNew;
  $('#setup-title').textContent = isNew ? 'Bắt đầu kế hoạch riêng' : 'Chỉnh kế hoạch';
  $('#setup-error').textContent = '';
  show('#setup-dialog');
}

function syncRecurrence() {
  $('#end-month-label').hidden = $('#item-form').elements.repeat.value === 'once';
}

function openItem(id = null, month = 1) {
  editingId = id;
  const i = id ? plan.items.find(i => i.id === id) : { name: '', type: 'expense', status: 'confirmed', amount: null, repeat: 'once', start: month, end: month, category: 'Sinh hoạt' };
  const f = $('#item-form').elements;
  for (const key of ['name', 'type', 'status', 'repeat', 'start', 'end', 'category']) f[key].value = i[key];
  if (!f.category.value) f.category.value = 'Khác';
  f.amount.value = i.amount ?? '';
  $('#item-title').textContent = id ? 'Chỉnh khoản thu / chi' : 'Thêm khoản thu / chi';
  $('#delete-item').hidden = !id;
  $('#item-error').textContent = '';
  syncRecurrence();
  show('#item-dialog');
}

function openActual(id) {
  actualId = id;
  const i = plan.items.find(i => i.id === id);
  $('#actual-context').textContent = `${i.name} · Tháng ${selectedMonth} · Dự kiến ${money(i.amount)}`;
  $('#actual-form').elements.actual.value = i.actuals[selectedMonth] ?? '';
  $('#actual-error').textContent = '';
  show('#actual-dialog');
}

$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = event.currentTarget.elements;
    const next = setupNew ? blankPlan() : structuredClone(plan);
    next.name = f.name.value; next.year = Number(f.year.value); next.openingCash = amountInput(f.openingCash.value);
    commit(next);
    $('#setup-dialog').close();
  } catch (error) { $('#setup-error').textContent = error.message; }
});

$('#item-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = event.currentTarget.elements;
    const next = structuredClone(plan);
    const previous = next.items.find(i => i.id === editingId);
    const start = Number(f.start.value);
    const end = f.repeat.value === 'once' ? start : Number(f.end.value);
    if (end < start) throw new Error('Tháng kết thúc phải bằng hoặc sau tháng bắt đầu.');
    const actuals = previous?.actuals ?? {};
    if (Object.keys(actuals).some(m => Number(m) < start || Number(m) > end)) throw new Error('Khoảng tháng mới loại bỏ số thực tế đã ghi. Hãy xóa số thực tế liên quan trong chi tiết tháng trước khi đổi khoảng.');
    const item = { id: editingId || crypto.randomUUID(), name: f.name.value, type: f.type.value, status: f.status.value,
      amount: amountInput(f.amount.value), repeat: f.repeat.value, start, end, category: f.category.value, actuals };
    if (editingId) next.items[next.items.findIndex(i => i.id === editingId)] = item;
    else next.items.push(item);
    commit(next);
    $('#item-dialog').close();
  } catch (error) { $('#item-error').textContent = error.message; }
});

$('#actual-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const next = structuredClone(plan);
    const item = next.items.find(i => i.id === actualId);
    const actual = amountInput(event.currentTarget.elements.actual.value);
    if (actual === null) delete item.actuals[selectedMonth]; else item.actuals[selectedMonth] = actual;
    commit(next);
    $('#actual-dialog').close();
  } catch (error) { $('#actual-error').textContent = error.message; }
});

$('#confirm-form').addEventListener('submit', event => {
  event.preventDefault();
  const action = confirmAction;
  confirmAction = undefined;
  $('#confirm-dialog').close();
  action?.();
});
$('#confirm-dialog').addEventListener('close', () => { confirmAction = undefined; });

$('#delete-item').addEventListener('click', () => {
  const id = editingId;
  const i = plan.items.find(i => i.id === id);
  confirmChange('Xóa khoản thu / chi?', `Xóa “${i.name}” khỏi toàn bộ kế hoạch, gồm mọi lần lặp và số thực tế đã ghi?`, () => {
    const next = structuredClone(plan);
    next.items = next.items.filter(i => i.id !== id);
    commit(next, 'Đã xóa khoản khỏi kế hoạch.');
    $('#item-dialog').close();
  });
});

$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `money-seasons-${plan.year}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Đã tạo tệp xuất không mã hóa. Hãy giữ tệp ở nơi an toàn.');
});

$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.currentTarget.files[0];
  event.currentTarget.value = '';
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Tệp quá lớn. Bản thử nghiệm hỗ trợ tệp JSON tối đa 1 MB.');
    const next = validatePlan(JSON.parse(await file.text()));
    forecast(next, true);
    confirmChange('Thay kế hoạch bằng bản nhập?', `Mở “${next.name}” (${next.year}, ${next.items.length} khoản). Kế hoạch hiện tại sẽ bị thay thế.`, () => commit(next, 'Đã nhập và lưu kế hoạch.'));
  } catch (error) {
    toast(error instanceof SyntaxError ? 'Tệp JSON bị lỗi. Kế hoạch hiện tại được giữ nguyên.' : error.message);
  }
});

$('#restore-demo').addEventListener('click', () => confirmChange('Khôi phục dữ liệu mẫu?', 'Kế hoạch hiện tại sẽ được thay bằng một năm minh họa. Hãy xuất bản sao trước nếu cần.', () => {
  commit(demoPlan(), 'Đã khôi phục dữ liệu mẫu.');
  $('#help-dialog').close();
}));

$('#new-plan').addEventListener('click', () => openSetup(true));
$('#settings-button').addEventListener('click', () => openSetup());
$('#help-button').addEventListener('click', () => show('#help-dialog'));
$('#add-button').addEventListener('click', () => openItem());
$('#add-in-month').addEventListener('click', () => openItem(null, selectedMonth));
$('#previous-month').addEventListener('click', () => openMonth(selectedMonth - 1));
$('#next-month').addEventListener('click', () => openMonth(selectedMonth + 1));
$('#include-tentative').addEventListener('change', render);
$('#item-form').elements.repeat.addEventListener('change', syncRecurrence);

// All user-supplied text is escaped or assigned via textContent. No innerHTML from imports.
document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) { close.closest('dialog').close(); return; }
  const month = event.target.closest('[data-month]');
  if (month) { openMonth(Number(month.dataset.month)); return; }
  const edit = event.target.closest('[data-edit]');
  if (edit) { openItem(edit.dataset.edit); return; }
  const actual = event.target.closest('[data-actual]');
  if (actual) { openActual(actual.dataset.actual); return; }
  if (event.target.closest('[data-setup]')) { openSetup(); return; }
  const nav = event.target.closest('[data-view]');
  if (nav) { view = nav.dataset.view; render(); }
});

const monthOptions = MONTHS.map((m, index) => `<option value="${index + 1}">${m}</option>`).join('');
$('#start-month').innerHTML = monthOptions;
$('#end-month').innerHTML = monthOptions;
render();
