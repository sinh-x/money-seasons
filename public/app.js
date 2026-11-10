import { MAX_BYTES, blankPlan, demoPlan, validatePlan, forecast, monthRange, occurs, plannedAmount, estimateMonth, changeWindow, reviseEstimate, latestSnapshot, cashBaseline, debtTotal, setSnapshot, convertLegacy, todayISO } from './model.js';
import { parseAmount, formatAmountInput } from './amount-input.js';
import { tagLibrary, groupExpenses, uniqueTagName, removeTagDefinition } from './expense-tags.js';
import { validateBasePath, apiPath } from './base-path.js';
const basePath = validateBasePath(document.documentElement.getAttribute('data-base-path') ?? '');
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => value === null ? 'Chưa biết' : `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const label = month => `${month.slice(5)} / ${month.slice(0, 4)}`;
const TYPES = { person: ['♙', 'Cá nhân'], group: ['♧', 'Nhóm'], category: ['▦', 'Danh mục'] };
const TITLES = { calendar: 'Lịch tài chính', expense: 'Rõ chi', income: 'Đa thu', accounts: 'Tài khoản & số dư', debts: 'Công nợ' };
const KEY = 'money-seasons.plan.v1';
let plan = blankPlan(), revision = 0, initialized = false, csrf = '', serverLegacy = null;
let view = 'calendar', selectedMonth = plan.startMonth, table = innerWidth > 760, tentative = false;
let pending = null, busy = false, confirmAction, submitEditor, migration = null, focusSource, toastTimer;
const range = () => monthRange(plan.startMonth, plan.endMonth);
const results = () => forecast(plan, tentative);
const blocked = () => busy || !!pending || !!serverLegacy;
// Ephemeral view state only: never included in plan saves/exports or API writes.
const collapsed = new Set();
// Longer than the model's 80-character ID limit: cannot alias imported IDs.
const NEW_TAG = 'new:'.repeat(21);
let expenseGroups = ['object', '', ''], expenseSearch = '', allExpenseSchedules = false, showExpenseAmounts = false, tagRowCounter = 0;
const expenseTree = () => groupExpenses(plan, selectedMonth, expenseGroups, { allSchedules: allExpenseSchedules, search: expenseSearch });
const expenseGroupKey = g => `expense:${JSON.stringify(g.path)}`;
const walkGroups = groups => groups.flatMap(g => [g, ...walkGroups(g.children)]);
const hiddenGroup = key => collapsed.has(key) ? 'hidden' : '';
function collapseButton(key, title, controls, text = title) {
  return `<button type="button" class="collapse-toggle" data-collapse="${h(key)}" aria-expanded="${!collapsed.has(key)}" aria-controls="${h(controls)}" aria-label="${collapsed.has(key) ? 'Mở rộng' : 'Thu gọn'} ${h(title)}">${h(text)}</button>`;
}
function collapseKeys() {
  if (view === 'calendar') return table ? ['section:income', 'section:expense', ...['income', 'expense'].flatMap(type => plan.objects.filter(o => plan.items.some(i => i.objectId === o.id && i.type === type)).map(o => `calendar:${type}:${o.id}`))] : [];
  if (view === 'expense') return walkGroups(expenseTree()).map(expenseGroupKey);
  if (view === 'income') return plan.objects.filter(o => plan.items.some(i => i.objectId === o.id && i.type === view)).map(o => `object:${view}:${o.id}`);
  return [`history:${view}`];
}
function collapseTools() {
  return collapseKeys().length ? '<div class="collapse-tools" role="group" aria-label="Mức chi tiết"><button type="button" class="button small" data-collapse-all="close">Thu gọn tất cả</button><button type="button" class="button small" data-collapse-all="open">Mở rộng tất cả</button></div>' : '';
}
function toggleCollapse(target) {
  const key = target.dataset.collapse, all = target.dataset.collapseAll;
  if (key !== undefined) { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); }
  else for (const entry of collapseKeys()) { if (all === 'close') collapsed.add(entry); else collapsed.delete(entry); }
  // Table/region scrolling and keyboard focus survive the view-only rerender.
  const scrollers = $$('.table-scroll, .history-scroll').map(e => ({ left: e.scrollLeft, top: e.scrollTop }));
  render();
  const next = key !== undefined ? $$('[data-collapse]').find(e => e.dataset.collapse === key) : $$('[data-collapse-all]').find(e => e.dataset.collapseAll === all);
  next?.focus({ preventScroll: true });
  $$('.table-scroll, .history-scroll').forEach((e, index) => { if (scrollers[index]) { e.scrollLeft = scrollers[index].left; e.scrollTop = scrollers[index].top; } });
}
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
function warning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = !message; }
function authenticated(value) { $('#access-panel').hidden = value; $('#application').hidden = !value; if (!value) $$('dialog[open]').forEach(d => d.close()); }
async function api(url, options = {}) {
  const response = await fetch(apiPath(basePath, url), { ...options, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401) authenticated(false); throw Object.assign(new Error(result.error || 'request-failed'), { status: response.status }); }
  return result;
}
function download(raw, filename) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function confirmChange(title, message, action) {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; confirmAction = action; $('#confirm-dialog').showModal();
}
async function load() {
  const saved = await api('/api/plan');
  if (saved.durabilityUncertain) throw new Error('Độ bền tệp chưa rõ; cần người vận hành kiểm tra.');
  serverLegacy = saved.migrationRequired ? saved.plan : null;
  plan = saved.plan && !serverLegacy ? validatePlan(saved.plan) : blankPlan(); revision = saved.revision; initialized = !!saved.plan;
  pending = null; selectedMonth = plan.startMonth; render();
  warning(serverLegacy ? 'Máy chủ còn nguyên bản v1/v2. Chưa chuyển dữ liệu: xuất nguyên bản, xem ánh xạ và xác nhận trước. Kế hoạch trống dưới đây KHÔNG thay thế bản cũ.' : !initialized ? 'Máy chủ chưa có kế hoạch. Lưu thao tác đầu tiên sẽ khởi tạo; không tự lưu dữ liệu mẫu. Chưa có số dư là chưa biết.' : '');
}
async function commit(candidate, operation = 'edit', migrationConfirmed = false) {
  if (busy || pending || (serverLegacy && !migrationConfirmed)) { toast('Hãy giải quyết bản chưa lưu hoặc chuyển nguyên bản trước.'); return false; }
  const valid = validatePlan(candidate);
  const draft = { candidate: valid, revision, operation: initialized ? operation : 'replace', migrationConfirmed, checked: false };
  const body = JSON.stringify({ plan: valid, expectedRevision: revision, operation: draft.operation, confirmed: true, migrationConfirmed });
  if (new TextEncoder().encode(body).length > MAX_BYTES) throw new Error('Yêu cầu vượt 1 MB.');
  busy = true; renderStatus();
  try {
    const saved = await api('/api/plan', { method: 'PUT', body });
    plan = validatePlan(saved.plan); revision = saved.revision; initialized = true; serverLegacy = null;
    warning(''); toast('Đã lưu bền vững trên máy chủ laptop.'); return true;
  } catch (e) {
    pending = draft; plan = valid;
    warning(e.status === 409 ? 'Xung đột: CHƯA LƯU. Giữ bản sửa để xuất; nạp bản máy chủ rồi kiểm tra và áp dụng lại bằng tay.' : 'CHƯA XÁC NHẬN LƯU. Xuất bản sửa và đọc lại trạng thái trước khi thử tiếp; không đóng trang. Độ bền chưa rõ cần người vận hành kiểm tra.');
    return false;
  } finally { busy = false; render(); }
}
function renderStatus() {
  $('#save-status').textContent = pending ? `CHƯA LƯU · dựa trên phiên bản ${pending.revision}` : busy ? 'Đang lưu… chưa đóng trang.' : initialized ? `Đã lưu · phiên bản ${revision}${serverLegacy ? ' · nguyên bản chưa chuyển' : ''}` : 'Chưa khởi tạo kế hoạch máy chủ';
  $('#save-recovery').hidden = !pending; $('#retry-button').hidden = !pending?.checked;
  $('#legacy-button').hidden = !serverLegacy && !hasBrowserLegacy();
  $$('[data-mutate], #settings-button').forEach(e => { e.disabled = blocked(); });
  $$('#editor input, #editor select, #editor textarea, #editor button[type=submit]').forEach(e => { e.disabled = busy || !!pending || e.hasAttribute('data-locked') || e.hasAttribute('data-inactive') || (e.name === 'ack' && !migration?.downloaded); });
  if (pending && $('#editor').open && $('#form-error')) { $('#form-error').hidden = false; $('#form-error').textContent = 'CHƯA LƯU. Dữ liệu biểu mẫu được giữ; đóng biểu mẫu để xuất bản sửa và đọc lại trạng thái.'; }
}
function hasBrowserLegacy() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
const button = (text, action, attrs = '', klass = '') => `<button class="button ${klass}" data-action="${action}" ${attrs}>${text}</button>`;
const stat = (title, value, note, klass = '') => `<article class="stat ${klass}"><span class="stat-label">${h(title)}</span><strong class="stat-value${String(value).length > 16 ? ' long-value' : ''}">${h(value)}</strong><small>${h(note)}</small></article>`;
const objectName = id => plan.objects.find(o => o.id === id)?.name ?? '';
const objectLabel = o => `${TYPES[o.type][0]} ${TYPES[o.type][1]} · ${o.name} [${o.id.slice(-8)}]`;
function monthOptions(value) { return range().map(m => `<option value="${m}" ${m === value ? 'selected' : ''}>${label(m)}</option>`).join(''); }
function controls() {
  return `<div class="controls"><label class="toggle"><input type="checkbox" id="include-tentative" ${tentative ? 'checked' : ''}>Tính cả khoản đang cân nhắc</label><label>Tháng xem <select class="select" id="view-month">${monthOptions(selectedMonth)}</select></label>${collapseTools()}</div>`;
}
function render() {
  if (!range().includes(selectedMonth)) selectedMonth = plan.startMonth;
  $('#plan-title').textContent = `${plan.name} · ${label(plan.startMonth)}–${label(plan.endMonth)}`;
  $$('[data-view]').forEach(e => { const active = e.dataset.view === view; e.classList.toggle('active', active); if (active) e.setAttribute('aria-current', 'page'); else e.removeAttribute('aria-current'); });
  const dimensions = new Set(['object', ...tagLibrary(plan).map(k => `tag:${k.id}`)]);
  expenseGroups = expenseGroups.map(d => dimensions.has(d) ? d : '');
  $('#workspace').innerHTML = view === 'calendar' ? calendarPage() : ['income', 'expense'].includes(view) ? itemPage(view) : accountsPage(view === 'debts');
  renderStatus();
}
function renderAndFocus(selector) { render(); $(selector)?.focus({ preventScroll: true }); }
function heading(title, description, actions = '') {
  return `<header class="page-heading"><div><div class="eyebrow">CÙNG HIỂU · CÙNG LÊN KẾ HOẠCH</div><h1>${h(title)}</h1><p>${h(description)}</p></div><div class="heading-actions">${actions}</div></header>`;
}
const sumItems = (items, month) => items.filter(i => occurs(i, month) && (i.status === 'confirmed' || tentative)).reduce((out, i) => {
  const value = plannedAmount(i, month); if (value === null) out.missing++; else out.known += value; return out;
}, { known: 0, missing: 0 });
const sumText = out => `${money(out.known)}${out.missing ? ' + ? (chưa biết)' : ''}`;
const flowText = (month, type) => sumText({ known: month[type], missing: month[`${type}Missing`] });
function schedule(i) { const r = i.recurrence; return `${r.kind === 'once' ? 'Một lần' : r.everyMonths === 12 ? 'Hằng năm' : `Mỗi ${r.everyMonths} tháng`} · ${label(r.anchor)}–${label(r.end)}`; }
const amountSwitch = () => `<label class="toggle amount-switch"><input type="checkbox" role="switch" data-amount-visibility ${showExpenseAmounts ? 'checked' : ''}><span>Ẩn/Hiện số tiền cụ thể</span></label>`;
const expenseMoney = content => `<span data-money-only ${showExpenseAmounts ? '' : 'hidden'}>${content}</span>`;
function syncExpenseVisibility() {
  $$('[data-amount-visibility]').forEach(input => { input.checked = showExpenseAmounts; });
  $$('[data-money-only]').forEach(node => { node.hidden = !showExpenseAmounts; });
}
function expensePage() {
  const items = plan.items.filter(i => i.type === 'expense'), current = items.filter(i => occurs(i, selectedMonth)), library = tagLibrary(plan), months = range(), index = months.indexOf(selectedMonth);
  const options = [['', 'Không nhóm'], ['object', 'Đối tượng / người'], ...library.map(k => [`tag:${k.id}`, k.name])];
  const context = `<section class="controls month-context" aria-label="Tháng xem và hiển thị số tiền"><div class="controls-left">${button('‹', 'previous-month', `aria-label="Tháng trước" ${index === 0 ? 'disabled' : ''}`)}<label>Tháng xem <select class="select" id="view-month">${monthOptions(selectedMonth)}</select></label>${button('›', 'next-month', `aria-label="Tháng sau" ${index === months.length - 1 ? 'disabled' : ''}`)}</div>${amountSwitch()}</section>`;
  const groups = expenseTree();
  const branch = (g, indexPath) => {
    const key = expenseGroupKey(g), details = `expense-group-${indexPath}`, object = g.dimension === 'object' ? plan.objects.find(o => o.id === g.value) : null;
    const inherited = g.path.find(([dimension]) => dimension === 'object')?.[1], children = g.children.filter(child => child.items.length);
    const attrs = `data-kind="expense" ${inherited ? `data-object="${h(inherited)}"` : ''} ${g.dimension === 'type' ? `data-repeat-kind="${g.value}"` : ''} data-mutate`;
    return `<article class="expense-group ${object ? 'object-card collapsible-object' : 'panel'}" ${object ? `data-object="${h(object.id)}"` : ''}><header class="object-header"><div class="object-identity">${object ? `<span class="object-icon ${object.type}" aria-hidden="true">${TYPES[object.type][0]}</span>` : ''}<div><h2 class="${object ? 'object-title' : 'expense-group-title'}">${collapseButton(key, g.label, details)}</h2><small>${object ? `${TYPES[object.type][1]} · Mã ${h(object.id.slice(-8))} · ` : ''}${g.items.length} khoản</small></div></div><div class="object-total">${expenseMoney(`<strong>${h(sumText(sumItems(g.items, selectedMonth)))}</strong>`)}<small>Dự kiến ${label(selectedMonth)}</small></div></header><div id="${details}" ${hiddenGroup(key)}>${object ? `<div class="object-management">${button('Đổi tên / loại', 'object', `data-id="${h(object.id)}" data-mutate`, 'text small')}${button('Xóa đối tượng', 'delete-object', `data-id="${h(object.id)}" data-mutate`, 'text small danger')}</div>` : ''}${children.length ? `<div class="expense-children">${children.map((child, n) => branch(child, `${indexPath}-${n}`)).join('')}</div>` : g.items.map(item => expenseRow(item, library)).join('') || '<p class="empty">Chưa có khoản chi phù hợp.</p>'}<footer class="object-footer">${button('＋ Thêm chi tiết chi', 'item', attrs, 'text')}</footer></div></article>`;
  };
  return heading(TITLES.expense, 'Bắt đầu từ ai, cho việc gì. Tự chọn tối đa ba mức nhóm. Chưa biết số tiền vẫn có thể lên kế hoạch.', button('⚑ Quản lý thẻ', 'tags', 'data-mutate') + button('＋ Tạo đối tượng', 'object', 'data-mutate') + button('＋ Thêm khoản chi', 'item', 'data-kind="expense" data-mutate', 'primary')) + context +
    `<div class="summary-grid">${stat('Khoản trong tháng', current.length, 'Các lần thuộc tháng đang xem.', 'highlight')}${stat('Đối tượng', plan.objects.length, 'Dùng chung hai trang thu / chi.')}${stat('Lịch đã lưu', items.length, 'Kể cả ngoài tháng đang xem.')}<article class="stat"><span class="stat-label">Dự kiến chi · ${label(selectedMonth)}</span>${expenseMoney(`<strong class="stat-value long-value">${h(sumText(sumItems(items, selectedMonth)))}</strong>`)}</article></div>` +
    `<section class="expense-toolbar" aria-label="Lọc và nhóm khoản chi"><label class="field">Tìm khoản chi / chi tiết<input class="search" id="expense-search" type="search" value="${h(expenseSearch)}" placeholder="Tên khoản chi hoặc chi tiết…"></label><div class="grouping-slots" role="group" aria-label="Ba mức nhóm dùng chung">${expenseGroups.map((value, n) => `<label class="field"><span>Mức ${n + 1}</span><select data-group-level="${n}">${options.map(([id, name]) => `<option value="${h(id)}" ${id === value ? 'selected' : ''} ${id && id !== value && expenseGroups.includes(id) ? 'disabled' : ''}>${h(name)}</option>`).join('')}</select></label>`).join('')}<p class="fixed-type">→ Lặp lại / Một lần<br><small>Luôn ở mức trong cùng</small></p></div><div class="controls"><label class="toggle"><input type="checkbox" id="include-tentative" ${tentative ? 'checked' : ''}>Tính cả khoản đang cân nhắc</label>${button(allExpenseSchedules ? 'Chỉ tháng đang xem' : 'Xem tất cả lịch đã lưu', 'all-expense-schedules', `aria-pressed="${allExpenseSchedules}"`)}</div>${collapseTools()}</section><p class="view-note">${allExpenseSchedules ? 'Tất cả lịch đã lưu · tổng vẫn chỉ tính tháng đang xem.' : `Các khoản chi thuộc tháng ${label(selectedMonth)}.`}</p><section class="object-grid" aria-label="Các khoản chi">${groups.filter(g => g.items.length || g.dimension === 'object').map((g, n) => branch(g, String(n))).join('') || '<p class="empty panel">Không có khoản chi phù hợp.</p>'}</section>`;
}
function expenseRow(item, library) {
  const month = estimateMonth(item, selectedMonth), active = occurs(item, selectedMonth);
  return `<div class="detail-row" data-expense-id="${h(item.id)}"><div><strong>${h(item.name)}</strong><p>${h(item.description)}</p><small>${h(objectName(item.objectId))} · ${h(schedule(item))}${!active ? ' · Ngoài tháng đang xem' : ''}${item.status === 'tentative' ? ' · Đang cân nhắc' : ''}</small><div class="expense-tags">${(item.tags ?? []).map(t => { const key = library.find(k => k.id === t.keyId); return `<span class="pill">${h(key.name)}: ${h(key.values.find(v => v.id === t.valueId).name)}</span>`; }).join('')}</div></div><div class="row-actions">${expenseMoney(button(h(money(plannedAmount(item, month))), 'item', `data-id="${h(item.id)}" data-month="${month}" data-mutate`, 'amount-button'))}${button('Sửa chi tiết', 'item', `data-id="${h(item.id)}" data-mutate`, 'small')}${button('Xóa', 'delete-item', `data-id="${h(item.id)}" data-mutate aria-label="Xóa ${h(item.name)}"`, 'small danger')}</div></div>`;
}
function itemPage(kind) {
  if (kind === 'expense') return expensePage();
  const expense = kind === 'expense', items = plan.items.filter(i => i.type === kind);
  const objects = plan.objects.filter(o => expense || items.some(i => i.objectId === o.id));
  return heading(TITLES[kind], expense ? 'Bắt đầu từ một người, nhóm hoặc danh mục. Nhớ điều cần chi, thêm chi tiết và lịch, rồi bổ sung tiền sau.' : 'Chỉ hiện đối tượng đã có khoản thu, kể cả chưa biết tiền. Mọi đối tượng dùng chung đều có thể chọn khi thêm thu.',
    button('＋ Tạo đối tượng', 'object', 'data-mutate') + button(`＋ Thêm khoản ${expense ? 'chi' : 'thu'}`, 'item', `data-kind="${kind}" data-mutate`, 'primary')) +
    `<div class="summary-grid">${stat(`Dự kiến ${expense ? 'chi' : 'thu'} · ${label(selectedMonth)}`, sumText(sumItems(items, selectedMonth)), 'Chỉ tính những lần thuộc tháng đang xem.', 'highlight')}${stat('Đối tượng hiển thị', objects.length, expense ? 'Kể cả đối tượng trống.' : 'Có khoản thu là hiển thị.')}${stat('Khoản đã lên kế hoạch', items.length, 'Không ghi số thực tế.')}${stat('Đầu vào số tiền', 'Mặc định × 1.000', '5 = 5.000 ₫ · 5tr = 5.000.000 ₫')}</div>` + controls() +
    `<div class="steps"><span>1 · Tạo / chọn đối tượng</span><span>→ 2 · Mục đích</span><span>→ 3 · Chi tiết & lịch</span><span>→ 4 · Tiền nhập sau</span></div><section class="object-grid" aria-label="Danh sách đối tượng">${objects.map((o, index) => {
      const rows = items.filter(i => i.objectId === o.id), key = `object:${kind}:${o.id}`, detailsId = `object-${kind}-${index}-details`;
      return `<article class="object-card collapsible-object" data-object="${h(o.id)}"><header class="object-header"><div class="object-identity"><span class="object-icon ${o.type}" aria-hidden="true">${TYPES[o.type][0]}</span><div><h2 class="object-title">${collapseButton(key, o.name, detailsId)}</h2><small>${TYPES[o.type][1]} · Mã ${h(o.id.slice(-8))} · ${rows.length} khoản · dùng chung hai trang</small></div></div><div class="object-total"><strong>${h(sumText(sumItems(rows, selectedMonth)))}</strong><small>Dự kiến ${label(selectedMonth)}</small></div></header>
      <div id="${detailsId}" ${hiddenGroup(key)}><div class="object-management">${button('Đổi tên / loại', 'object', `data-id="${h(o.id)}" data-mutate`, 'text small')}${button('Xóa đối tượng', 'delete-object', `data-id="${h(o.id)}" data-mutate`, 'text small danger')}</div>
      ${rows.length ? `<div class="object-rows">${rows.map(i => {
        const month = estimateMonth(i, selectedMonth);
        const scopeNote = !range().some(m => occurs(i, m)) ? ' · Ngoài kỳ dự báo · lịch vẫn được lưu' : i.recurrence.anchor < plan.startMonth || i.recurrence.end > plan.endMonth ? ' · Chỉ tính phần lịch trong kỳ dự báo' : '';
        return `<div class="detail-row"><div><strong>${h(i.name)}</strong><p>${h(i.description)}</p><small>${h(schedule(i))}${h(scopeNote)}${i.status === 'tentative' ? ' · Đang cân nhắc' : ''}</small></div><div class="row-actions">${button(h(money(plannedAmount(i, month))), 'item', `data-id="${h(i.id)}" data-month="${month}" data-mutate`, 'amount-button')}${button('Sửa chi tiết', 'item', `data-id="${h(i.id)}" data-mutate`, 'small')}${button('Xóa', 'delete-item', `data-id="${h(i.id)}" data-mutate aria-label="Xóa ${h(i.name)}"`, 'small danger')}</div></div>`;
      }).join('')}</div>` : '<p class="empty">Chưa có khoản chi. Ghi điều cần chuẩn bị trước, chưa cần biết tiền.</p>'}
      <footer class="object-footer">${button(`＋ Thêm chi tiết ${expense ? 'chi' : 'thu'}`, 'item', `data-kind="${kind}" data-object="${h(o.id)}" data-mutate`, 'text')}<span class="object-meta">Không ghi thực tế</span></footer></div></article>`;
    }).join('') || '<p class="empty panel">Chưa có đối tượng phù hợp. Tạo đối tượng hoặc thêm khoản thu để bắt đầu.</p>'}</section>`;
}
function calendarPage() {
  const data = results(), selected = data.find(m => m.month === selectedMonth);
  return heading(TITLES.calendar, 'Số dư tài khoản + kế hoạch thu chi. Một dòng thời gian liên tục, không đặt lại khi sang năm.', button('＋ Khoản thu', 'item', 'data-kind="income" data-mutate') + button('＋ Khoản chi', 'item', 'data-kind="expense" data-mutate', 'primary')) +
    `<div class="summary-grid">${stat(`Đầu tháng ${label(selectedMonth)}`, money(selected.opening), selected.openingIncomplete ? 'Phần đã biết · chưa đủ dữ liệu' : selected.reset ? 'Mốc số dư tài khoản, không phải thu.' : 'Chuyển từ cuối tháng trước.')}${stat('Thu dự kiến', flowText(selected, 'income'), 'Không phải thu nhập thực nhận.')}${stat('Chi dự kiến', flowText(selected, 'expense'), selected.expenseMissing ? `${selected.expenseMissing} khoản chưa biết số tiền.` : 'Toàn bộ kế hoạch tháng.')}${stat('Cuối tháng dự kiến', money(selected.closing), selected.incomplete ? 'Phần đã biết · chưa đủ dữ liệu' : selected.closing < 0 ? 'Số dư âm' : 'Ước tính theo tháng', selected.closing < 0 ? 'negative' : 'highlight')}</div>
    <p class="info amber">Mỗi tháng có số dư mới sẽ đặt lại mốc gộp từ số dư gần nhất của từng tài khoản, kể cả ngày cũ. Vẫn tính toàn bộ kế hoạch tháng cập nhật; có thể trùng với chi tiêu đã nằm trong số dư. Đây là ước tính, không phải đối soát giao dịch.</p>${controls()}
    <div class="controls"><h2>${data.length} tháng · ${label(plan.startMonth)} → ${label(plan.endMonth)}</h2><div class="segmented" role="group" aria-label="Kiểu hiển thị">${button('Bảng chi tiết', 'table', `aria-pressed="${table}"`)}${button('Thẻ tháng', 'cards', `aria-pressed="${!table}"`)}</div></div>${table ? forecastTable(data) : forecastCards(data)}`;
}
function forecastTable(data) {
  const row = (title, key, klass = 'total-row') => `<tbody><tr class="${klass}"><th scope="row" class="row-label">${title}</th>${data.map(m => `<td>${h(['income', 'expense'].includes(key) ? flowText(m, key) : money(m[key]))}${key === 'opening' ? `<span class="sub">${m.reset ? 'Mốc tài khoản mới' : 'Chuyển từ tháng trước'}${m.openingIncomplete ? ' · chưa đủ dữ liệu' : ''}</span>` : key === 'closing' ? `<span class="sub">${m.incomplete ? 'Chưa đủ dữ liệu' : 'Đã biết'}${m.closing < 0 ? ' · Số dư âm' : ''}</span>` : ''}</td>`).join('')}</tr></tbody>`;
  const section = type => {
    const sectionId = `calendar-${type}-groups`, key = `section:${type}`;
    const groups = plan.objects.filter(o => plan.items.some(i => i.objectId === o.id && i.type === type));
    return `<tbody><tr class="section-row"><th scope="row" class="row-label">${collapseButton(key, type === 'income' ? 'THU DỰ KIẾN' : 'CHI DỰ KIẾN', sectionId)}</th>${data.map(() => '<td></td>').join('')}</tr></tbody><tbody id="${sectionId}" ${hiddenGroup(key)}>` + groups.map((o, index) => {
      const items = plan.items.filter(i => i.objectId === o.id && i.type === type), groupKey = `calendar:${type}:${o.id}`;
      const ids = items.map((_, n) => `calendar-${type}-${index}-detail-${n}`);
      return `<tr class="group-row"><th scope="row" class="row-label">${collapseButton(groupKey, objectLabel(o), ids.join(' '))}</th>${data.map(m => `<td>${h(sumText(sumItems(items, m.month)))}</td>`).join('')}</tr>` + items.map((i, n) => `<tr id="${ids[n]}" ${hiddenGroup(groupKey)}><th scope="row" class="row-label detail-label">${h(i.name)}</th>${data.map(m => `<td>${!occurs(i, m.month) ? '—' : i.status === 'tentative' && !tentative ? 'Không tính' : button(h(money(plannedAmount(i, m.month))), 'item', `data-id="${h(i.id)}" data-month="${m.month}" data-mutate aria-label="${h(i.name)}: sửa từ ${label(m.month)}"`, 'cell-edit')}</td>`).join('')}</tr>`).join('');
    }).join('') + '</tbody>';
  };
  return `<div class="panel"><div class="table-scroll" tabindex="0" role="region" aria-label="Bảng tháng, cuộn ngang để xem thêm"><table class="calendar-table"><thead><tr><th scope="col" class="row-label">Nội dung / đối tượng · VND</th>${data.map(m => `<th scope="col">${label(m.month)}</th>`).join('')}</tr></thead><tbody>
    ${plan.accounts.map(a => `<tr><th scope="row" class="row-label">${h(a.name)} · Số dư tham chiếu</th>${data.map(m => { const s = latestSnapshot(plan.snapshots, a.id, m.month); return `<td>${s ? `${h(money(s.amount))}<span class="sub">${s.date}${s.date.slice(0, 7) < m.month ? ' · Mốc cũ' : ''}</span>` : 'Chưa biết'}</td>`; }).join('')}</tr>`).join('')}</tbody>
    ${row('Số dư bắt đầu tính tháng', 'opening')}${section('income')}${row('Tổng thu dự kiến', 'income')}${section('expense')}${row('Tổng chi dự kiến', 'expense')}${row('Chênh lệch kế hoạch', 'net')}${row('Số dư dự kiến cuối tháng', 'closing', 'balance-row')}</table></div></div>`;
}
function forecastCards(data) {
  let year = '';
  return `<div class="month-card-grid">${data.map(m => {
    const heading = year === m.month.slice(0, 4) ? '' : `<h3 class="year-heading">${year = m.month.slice(0, 4)}</h3>`;
    return `${heading}<article class="month-card" data-month="${m.month}"><h3>${label(m.month)}</h3><strong class="closing">${h(money(m.closing))}</strong><dl><dt>Đầu tháng</dt><dd>${h(money(m.opening))}</dd><dt>Thu dự kiến</dt><dd>${h(flowText(m, 'income'))}</dd><dt>Chi dự kiến</dt><dd>${h(flowText(m, 'expense'))}</dd></dl><small>${m.reset ? 'Mốc tài khoản mới' : 'Chuyển từ tháng trước'}${m.incomplete ? ' · Chưa đủ dữ liệu' : ''}${m.closing < 0 ? ' · Số dư âm' : ''}</small>${button('Chi tiết tháng', 'month', `data-month="${m.month}"`, 'text')}</article>`;
  }).join('')}</div>`;
}
function accountsPage(debt) {
  const accounts = debt ? plan.debtAccounts : plan.accounts, snapshots = debt ? plan.debtSnapshots : plan.snapshots;
  const group = (list, title) => `<h2>${title}</h2><div class="account-grid">${list.map(a => {
    const s = latestSnapshot(snapshots, a.id, selectedMonth);
    return `<article class="account-card"><div class="account-top"><h3>${h(a.name)}</h3></div><strong class="account-balance">${h(money(s?.amount ?? null))}</strong><span class="balance-date">${s ? `Số dư tại ${s.date}${s.date.slice(0, 7) < selectedMonth ? ' · Mốc cũ' : ''}` : 'Chưa có số dư phù hợp · Chưa biết'}</span>${button('＋ Nhập số dư theo ngày', 'snapshot', `data-id="${h(a.id)}" data-debt="${debt}" data-mutate`)}
    ${button('Đổi tên', 'account', `data-id="${h(a.id)}" data-debt="${debt}" data-mutate`, 'text small')}${debt ? button(a.direction === 'payable' ? 'Lên kế hoạch trả nợ' : 'Lên kế hoạch thu hồi', 'debt-plan', `data-id="${h(a.id)}" data-mutate`, 'text') : ''}</article>`;
  }).join('') || '<p class="empty">Chưa có tài khoản. Có thể tạo tên trước và nhập số dư sau.</p>'}</div>`;
  return heading(TITLES[debt ? 'debts' : 'accounts'], debt ? 'Hai hướng riêng: mình nợ và người khác nợ mình. Số dư nợ không phải tiền sẵn có; kế hoạch trả / thu hồi không tự giảm dư nợ.' : 'Số dư có ngày tham chiếu, không phải sổ giao dịch. Số dư tháng sau không áp dụng ngược về tháng trước.', button(debt ? '＋ Tạo tài khoản công nợ' : '＋ Thêm tài khoản', 'account', `data-debt="${debt}" data-mutate`, 'primary')) +
    `<div class="summary-grid">${debt ? stat('Mình đang nợ', sumText(debtTotal(plan, 'payable', selectedMonth)), 'Không trừ khỏi tiền sẵn có.', 'negative') + stat('Người khác nợ mình', sumText(debtTotal(plan, 'receivable', selectedMonth)), 'Chưa cộng vào tiền sẵn có.', 'highlight') : stat('Tổng số dư tham chiếu', sumText(cashBaseline(plan, selectedMonth)), 'Mỗi tài khoản chỉ lấy mốc mới nhất phù hợp.', 'highlight')}${stat('Tài khoản', accounts.length, 'Thiếu số dư là chưa biết, không phải 0.')}${stat('Ngày hôm nay', todayISO(), 'Asia/Ho_Chi_Minh · không nhập số dư tương lai.')}</div>${controls()}
    ${debt ? group(accounts.filter(a => a.direction === 'payable'), 'Mình đang nợ') + group(accounts.filter(a => a.direction === 'receivable'), 'Người khác nợ mình') : group(accounts, 'Các tài khoản')}
    <div class="section-heading"><h2>Lịch sử số dư theo ngày · ${snapshots.length} mốc</h2>${collapseButton(`history:${debt ? 'debts' : 'accounts'}`, 'lịch sử số dư', debt ? 'debt-history' : 'account-history', 'Chi tiết lịch sử')}</div><div id="${debt ? 'debt-history' : 'account-history'}" ${hiddenGroup(`history:${debt ? 'debts' : 'accounts'}`)} class="panel history-scroll" tabindex="0" role="region" aria-label="Lịch sử số dư"><table class="history-table"><thead><tr><th scope="col">Ngày</th><th scope="col">Tài khoản</th><th scope="col">Số dư</th><th scope="col">Sửa mốc</th></tr></thead><tbody>${[...snapshots].sort((a, b) => b.date.localeCompare(a.date)).map(s => `<tr><td>${s.date}</td><td>${h(accounts.find(a => a.id === s.accountId).name)}</td><td>${h(money(s.amount))}</td><td>${button('Sửa', 'snapshot', `data-id="${h(s.accountId)}" data-date="${s.date}" data-debt="${debt}" data-mutate`, 'small')}</td></tr>`).join('') || '<tr><td colspan="4">Chưa có mốc số dư.</td></tr>'}</tbody></table></div>`;
}
const field = (title, control, note = '', full = false) => `<label class="field ${full ? 'full' : ''}"><span>${title}</span>${control}${note ? `<small>${note}</small>` : ''}</label>`;
const amountField = (value = null, required = false) => field(required ? 'Số dư' : 'Ước tính mỗi lần', `<input name="amount" type="text" inputmode="text" maxlength="60" data-amount ${required ? 'required' : ''} value="${h(formatAmountInput(value))}" placeholder="${required ? 'Nhập số dư' : 'Chưa biết — nhập sau'}"><output class="amount-preview" aria-live="polite"></output>`, 'Mặc định nghìn: 5 = 5.000 ₫; 5tr / 5M = 5 triệu; 5 trăm = 500.000 ₫. Ghi VND để nhập nguyên đồng.');
function restoreFocus() {
  if (!focusSource) return;
  const { id, action, entity, month, object, repeatKind } = focusSource;
  const candidate = id ? document.getElementById(id) : $$('[data-action]').find(e => e.dataset.action === action && e.dataset.id === entity && e.dataset.month === month && e.dataset.object === object && e.dataset.repeatKind === repeatKind);
  (candidate ?? $('[data-view][aria-current]') ?? $('#settings-button')).focus();
}
function openEditor(title, subtitle, fields, handler, submit = 'Lưu', extra = '') {
  const source = document.activeElement; focusSource = { id: source?.id, action: source?.dataset.action, entity: source?.dataset.id, month: source?.dataset.month, object: source?.dataset.object, repeatKind: source?.dataset.repeatKind };
  submitEditor = handler;
  $('#editor').innerHTML = `<form id="edit-form"><header class="dialog-head"><div><h2 id="editor-title">${h(title)}</h2><p>${h(subtitle)}</p></div><button class="icon-button" type="button" data-close aria-label="Đóng">×</button></header><div class="dialog-body"><p id="form-error" class="form-error" role="alert" hidden></p><div class="fields">${fields}</div></div><footer class="dialog-actions">${extra}<button class="button" type="button" data-close>Hủy</button>${handler ? `<button class="button primary" type="submit">${h(submit)}</button>` : ''}</footer></form>`;
  $('#editor').showModal(); updatePreviews(); renderStatus();
}
function updatePreviews() {
  $$('[data-amount]').forEach(input => {
    const output = input.nextElementSibling;
    try { output.textContent = `Giá trị: ${money(parseAmount(input.value, { required: input.required }))}`; input.setCustomValidity(''); }
    catch (e) { output.textContent = e.message; input.setCustomValidity(e.message); }
  });
}
async function saveAndClose(next, operation = 'edit', migrated = false) { if (await commit(next, operation, migrated)) $('#editor').close(); }
function objectDialog(id) {
  const object = plan.objects.find(o => o.id === id);
  openEditor(object ? 'Đổi đối tượng dùng chung' : 'Tạo một đối tượng', 'Loại chỉ đổi biểu tượng, không thay phép tính hoặc quyền truy cập.',
    field('Tên hiển thị', `<input name="name" maxlength="80" required value="${h(object?.name)}">`, 'Tên trùng không tự gộp; dùng mã để phân biệt.', true) + field('Loại', `<select name="objectType">${Object.entries(TYPES).map(([key, [icon, text]]) => `<option value="${key}" ${key === object?.type ? 'selected' : ''}>${icon} ${text}</option>`).join('')}</select>`, '', true),
    async f => { const next = structuredClone(plan), value = { id: id || crypto.randomUUID(), name: f.name.value, type: f.objectType.value }; if (object) next.objects[next.objects.findIndex(o => o.id === id)] = value; else next.objects.push(value); await saveAndClose(next); });
}
function tagRow(tag = {}) {
  const n = ++tagRowCounter, library = tagLibrary(plan), key = library.find(k => k.id === tag.keyId);
  return `<div class="tag-row" data-tag-row><div class="tag-fields"><div class="tag-key-fields">${field('Khóa thẻ', `<select data-tag-key><option value="">Chọn khóa…</option>${library.map(k => `<option value="${h(k.id)}" ${k.id === tag.keyId ? 'selected' : ''}>${h(k.name)}</option>`).join('')}<option value="${NEW_TAG}">＋ Tạo khóa thẻ mới</option></select>`)}${field('Tên khóa mới', `<input data-new-key maxlength="160" id="tag-key-${n}">`)}</div><div data-tag-value-fields>${tagValueFields(key, tag.valueId)}</div></div><button type="button" class="button small danger remove-tag" data-remove-tag aria-label="Gỡ thẻ" title="Gỡ thẻ">×</button></div>`;
}
function tagValueFields(key, valueId) {
  return field('Giá trị', `<select data-tag-value><option value="">Chọn giá trị…</option>${(key?.values ?? []).map(v => `<option value="${h(v.id)}" ${v.id === valueId ? 'selected' : ''}>${h(v.name)}</option>`).join('')}<option value="${NEW_TAG}">＋ Thêm giá trị mới</option></select>`) + field('Tên giá trị mới', '<input data-new-value maxlength="160">');
}
function updateTagRows() {
  const rows = $$('#editor [data-tag-row]'), assigned = rows.map(row => row.querySelector('[data-tag-key]').value);
  for (const row of rows) {
    const key = row.querySelector('[data-tag-key]'), value = row.querySelector('[data-tag-value]');
    row.querySelector('[data-new-key]').closest('label').hidden = key.value !== NEW_TAG;
    row.querySelector('[data-new-value]').closest('label').hidden = value.value !== NEW_TAG;
    for (const option of key.options) option.disabled = !!option.value && option.value !== NEW_TAG && option.value !== key.value && assigned.includes(option.value);
  }
}
function collectExpenseTags(next) {
  const library = tagLibrary(plan), assignments = [];
  for (const row of $$('#editor [data-tag-row]')) {
    const keyId = row.querySelector('[data-tag-key]').value, valueId = row.querySelector('[data-tag-value]').value;
    let key = library.find(k => k.id === keyId);
    if (keyId === NEW_TAG) { key = { id: crypto.randomUUID(), name: uniqueTagName(row.querySelector('[data-new-key]').value, library), values: [] }; library.push(key); }
    if (!key || !valueId) throw new Error('Chọn khóa và giá trị cho mỗi thẻ, hoặc gỡ hàng chưa dùng.');
    let value = key.values.find(v => v.id === valueId);
    if (valueId === NEW_TAG) { value = { id: crypto.randomUUID(), name: uniqueTagName(row.querySelector('[data-new-value]').value, key.values) }; key.values.push(value); }
    if (!value) throw new Error('Chọn một giá trị thẻ hợp lệ.');
    assignments.push({ keyId: key.id, valueId: value.id });
  }
  next.tagDefinitions = library;
  return assignments;
}
function updateScheduleFields() {
  const form = $('#edit-form'), repeat = form?.elements.repeat; if (!repeat) return;
  const once = form.elements.expenseKind ? form.elements.expenseKind.value === 'once' : repeat.value === 'once';
  if (form.elements.expenseKind) { repeat.closest('label').hidden = once; repeat.toggleAttribute('data-inactive', once); repeat.disabled = once || busy || !!pending; }
  for (const [name, active] of [['end', !once], ['everyMonths', !once && repeat.value === 'interval']]) {
    const input = form.elements[name]; input.closest('label').hidden = !active;
    input.toggleAttribute('data-inactive', !active); input.disabled = !active || busy || !!pending;
  }
}
function itemDialog({ id, kind = 'expense', objectId, month = selectedMonth, suggestion = '', repeatKind = 'once' } = {}) {
  if (!plan.objects.length) { objectDialog(); toast('Tạo đối tượng trước, sau đó thêm chi tiết.'); return; }
  const item = plan.items.find(i => i.id === id); if (item) kind = item.type;
  const expense = kind === 'expense', effective = item ? estimateMonth(item, month) : month;
  const r = item?.recurrence ?? { kind: repeatKind, anchor: month, end: repeatKind === 'once' ? month : plan.endMonth, everyMonths: 1 };
  openEditor(`${item ? 'Chỉnh' : 'Thêm'} khoản ${expense ? 'chi' : 'thu'}`, 'Chọn đối tượng → mục đích → chi tiết & lịch → số tiền sau. Không ghi thực tế.',
    (expense ? `<div class="field full">${amountSwitch()}</div>` : '') +
    field('Đối tượng dùng chung', `<select name="objectId">${plan.objects.map(o => `<option value="${h(o.id)}" ${o.id === (item?.objectId ?? objectId) ? 'selected' : ''}>${h(objectLabel(o))}</option>`).join('')}</select>`, '', true) +
    field('Tên khoản / mục đích', `<input name="name" required maxlength="100" value="${h(item?.name ?? suggestion)}">`, '', true) +
    field('Chi tiết', `<textarea name="description" maxlength="500">${h(item?.description)}</textarea>`, '', true) +
    (expense ? `<div class="field full" data-money-only ${showExpenseAmounts ? '' : 'hidden'}>${amountField(item ? plannedAmount(item, effective) : null)}</div>` : amountField(item ? plannedAmount(item, effective) : null)) +
    field('Mức xác định', `<select name="status"><option value="confirmed">Đưa vào kế hoạch</option><option value="tentative" ${item?.status === 'tentative' ? 'selected' : ''}>Đang cân nhắc</option></select>`) +
    (expense ? field('Loại khoản chi', `<select name="expenseKind"><option value="once">Một lần</option><option value="interval" ${r.kind === 'interval' ? 'selected' : ''}>Lặp lại</option></select>`) : '') +
    field(expense ? 'Tần suất' : 'Lặp lại', `<select name="repeat">${expense ? '' : '<option value="once">Một lần</option>'}<option value="monthly" ${r.kind === 'interval' && r.everyMonths === 1 ? 'selected' : ''}>Hằng tháng</option><option value="interval" ${r.kind === 'interval' && ![1, 12].includes(r.everyMonths) ? 'selected' : ''}>Mỗi N tháng</option><option value="yearly" ${r.kind === 'interval' && r.everyMonths === 12 ? 'selected' : ''}>Hằng năm</option></select>`) +
    field('Khoảng lặp N', `<input name="everyMonths" type="number" min="1" max="120" step="1" value="${r.everyMonths}">`) +
    field('Tháng bắt đầu', `<input name="start" type="month" required value="${r.anchor}" min="2000-01" max="2100-12">`, 'Lịch được lưu độc lập với kỳ dự báo.') +
    field('Kết thúc (lịch lặp)', `<input name="end" type="month" value="${r.end}" min="2000-01" max="2100-12">`, 'Có thể ngoài kỳ dự báo. Chỉ tháng giao nhau được tính; không tự mở rộng kỳ.') +
    (item ? `${expense ? `<div class="field full" data-money-only ${showExpenseAmounts ? '' : 'hidden'}>` : ''}${field('Tháng hiệu lực số dự kiến', `<input name="effectiveMonth" type="month" required value="${effective}" min="2000-01" max="2100-12">`, 'Giữ các mốc sau đó; mọi thay đổi số tiền đều xem trước và xác nhận.', true)}${expense ? '</div>' : ''}` : '') +
    (expense ? `<section class="field full expense-tag-bundle" aria-label="Thẻ khoản chi"><h3>Thẻ khoản chi</h3><div id="expense-tag-rows">${(item?.tags ?? []).map(tagRow).join('')}</div><button type="button" class="button" data-add-tag>＋ Thêm thẻ</button></section>` : ''),
    async f => {
      const next = structuredClone(plan), repeat = expense && f.expenseKind.value === 'once' ? 'once' : f.repeat.value, n = repeat === 'yearly' ? 12 : repeat === 'interval' ? Number(f.everyMonths.value) : 1;
      const value = parseAmount(f.amount.value), entry = { id: id || crypto.randomUUID(), objectId: f.objectId.value, type: kind, name: f.name.value, description: f.description.value, status: f.status.value,
        amount: item ? item.amount : value, amountChanges: item?.amountChanges ?? [], recurrence: { kind: repeat === 'once' ? 'once' : 'interval', anchor: f.start.value, end: repeat === 'once' ? f.start.value : f.end.value, everyMonths: n } };
      if (expense) entry.tags = collectExpenseTags(next);
      if (item) next.items[next.items.findIndex(i => i.id === id)] = entry; else next.items.push(entry);
      let valid = validatePlan(next);
      if (item) {
        if (!occurs(entry, f.effectiveMonth.value)) throw new Error('Tháng hiệu lực phải thuộc lịch.');
        if (value !== plannedAmount(item, f.effectiveMonth.value)) {
          valid = reviseEstimate(valid, id, f.effectiveMonth.value, value);
          const later = item.amountChanges.filter(c => c.month > f.effectiveMonth.value).map(c => label(c.month)).join(', ');
          const message = showExpenseAmounts || !expense ? `${entry.name}: ${money(value)} từ ${label(f.effectiveMonth.value)}.` : `${entry.name}: đổi dự kiến từ ${label(f.effectiveMonth.value)}.`;
          confirmChange('Xem trước đổi dự kiến', `${message} Giữ dự kiến trước đó; thay mốc cùng tháng nếu có. ${later ? `Giữ các mốc muộn hơn: ${later}.` : 'Không có mốc muộn hơn.'}`, () => saveAndClose(valid)); return;
        }
      }
      if (item && JSON.stringify(item.recurrence) !== JSON.stringify(entry.recurrence)) confirmChange('Xác nhận đổi lịch cả chuỗi', 'Đổi lịch ảnh hưởng mọi lần dự kiến trong chuỗi. Không bỏ các mốc dự kiến đã lưu. Hãy kiểm tra trước khi lưu.', () => saveAndClose(valid));
      else await saveAndClose(valid);
    }, expense ? 'Lưu chi phí' : 'Lưu');
  $('#edit-form').dataset.itemId = id ?? '';
  // Hidden invalid money must report our visible error, not an unfocusable native
  // validation bubble. The shared validator still checks every field on save.
  $('#edit-form').noValidate = expense;
  updateScheduleFields(); updateTagRows();
}
function tagManager() {
  const library = tagLibrary(plan);
  openEditor('Quản lý thẻ', 'Đổi tên giữ nguyên mã. Chỉ xóa định nghĩa không còn được gán; không tự gán thẻ cho khoản chi.',
    field('Khóa thẻ', `<select name="manageKey"><option value="${NEW_TAG}">＋ Tạo khóa thẻ mới</option>${library.map(k => `<option value="${h(k.id)}">${h(k.name)}</option>`).join('')}</select>`, '', true) +
    field('Tên khóa', '<input name="keyName" maxlength="160" required>', '', true) +
    `<div id="managed-values" class="field full"></div>` +
    `<div class="field full controls-left"><button type="button" class="button danger" data-delete-tag-key>Xóa khóa</button><button type="button" class="button danger" data-delete-tag-value>Xóa giá trị</button></div>`,
    async f => {
      const next = structuredClone(plan), definitions = tagLibrary(plan); let key = definitions.find(k => k.id === f.manageKey.value);
      const name = uniqueTagName(f.keyName.value, definitions, key?.id);
      if (key) key.name = name; else { key = { id: crypto.randomUUID(), name, values: [] }; definitions.push(key); }
      if (f.manageValue.value) {
        let value = key.values.find(v => v.id === f.manageValue.value);
        const valueName = uniqueTagName(f.valueName.value, key.values, value?.id);
        if (value) value.name = valueName; else { value = { id: crypto.randomUUID(), name: valueName }; key.values.push(value); }
      }
      next.tagDefinitions = definitions; await saveAndClose(next);
    }, 'Lưu thẻ');
  updateManagedKey();
}
function updateManagedKey() {
  const f = $('#edit-form').elements, key = tagLibrary(plan).find(k => k.id === f.manageKey.value);
  f.keyName.value = key?.name ?? '';
  $('#managed-values').innerHTML = field('Giá trị', `<select name="manageValue"><option value="">Chỉ sửa khóa</option><option value="${NEW_TAG}">＋ Thêm giá trị mới</option>${(key?.values ?? []).map(v => `<option value="${h(v.id)}">${h(v.name)}</option>`).join('')}</select>`) + field('Tên giá trị', '<input name="valueName" maxlength="160">');
  updateManagedValue();
}
function updateManagedValue() {
  const f = $('#edit-form').elements, key = tagLibrary(plan).find(k => k.id === f.manageKey.value);
  f.valueName.closest('label').hidden = !f.manageValue.value;
  f.valueName.value = key?.values.find(v => v.id === f.manageValue.value)?.name ?? '';
}
async function deleteManagedTag(value = false) {
  try {
    const f = $('#edit-form').elements, keyId = f.manageKey.value, valueId = f.manageValue.value;
    if (keyId === NEW_TAG || (value && (!valueId || valueId === NEW_TAG))) throw new Error('Chọn định nghĩa đã lưu để xóa.');
    const next = removeTagDefinition(plan, keyId, value ? valueId : undefined);
    confirmChange('Xóa định nghĩa thẻ không dùng?', 'Không đổi số tiền, đối tượng hoặc lịch đã lưu.', () => saveAndClose(next));
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
}
function accountDialog(id, debt = false) {
  const source = debt ? plan.debtAccounts : plan.accounts, account = source.find(a => a.id === id);
  openEditor(account ? 'Đổi tên tài khoản' : debt ? 'Tạo tài khoản công nợ' : 'Thêm tài khoản tiền', 'Tài khoản không phải người đăng nhập. Lịch sử số dư được giữ; không có xóa tài khoản có lịch sử.',
    field('Tên tài khoản', `<input name="name" required maxlength="80" value="${h(account?.name)}">`, '', true) + (debt ? field('Hướng công nợ', `<select name="direction" ${account ? 'disabled data-locked' : ''}><option value="payable">Mình nợ</option><option value="receivable" ${account?.direction === 'receivable' ? 'selected' : ''}>Người khác nợ mình</option></select>`, 'Không bù trừ vào số dư tiền.', true) : ''),
    async f => { const next = structuredClone(plan), list = debt ? next.debtAccounts : next.accounts, value = { id: id || crypto.randomUUID(), name: f.name.value, ...(debt ? { direction: account?.direction ?? f.direction.value } : {}) }; if (account) list[list.findIndex(a => a.id === id)] = value; else list.push(value); await saveAndClose(next); });
}
function snapshotDialog(accountId, debt = false, date) {
  const snapshots = debt ? plan.debtSnapshots : plan.snapshots, accounts = debt ? plan.debtAccounts : plan.accounts;
  const account = accounts.find(a => a.id === accountId); if (!account) return;
  const existing = snapshots.find(s => s.accountId === accountId && s.date === date);
  openEditor('Số dư theo ngày', account.name,
    field('Ngày tham chiếu', `<input name="date" type="date" min="2000-01-01" max="${todayISO()}" required value="${date ?? todayISO()}" ${existing ? 'readonly' : ''}>`, 'Chỉ hôm nay / lịch sử, không phải ngày dự kiến.', true) + amountField(existing?.amount ?? null, true),
    async f => {
      const snapshot = { id: crypto.randomUUID(), accountId, date: f.date.value, amount: parseAmount(f.amount.value, { required: true }) };
      const same = snapshots.find(s => s.accountId === accountId && s.date === snapshot.date);
      const next = setSnapshot(plan, snapshot, { debt, confirmed: !!same });
      if (same) confirmChange('Thay số dư cùng ngày?', `${account.name} · ${snapshot.date}: ${money(same.amount)} → ${money(snapshot.amount)}. Giữ mã mốc; số dư ngày cũ không bị cộng dồn.`, () => saveAndClose(next));
      else await saveAndClose(next);
    });
}
function setupDialog(isNew = false) {
  const source = isNew ? blankPlan() : plan;
  openEditor(isNew ? 'Kế hoạch trống mới' : 'Chỉnh kế hoạch', 'Kỳ dự báo 1–120 tháng trong 2000–2100. Giữ nguyên toàn bộ lịch thu chi, kể cả ngoài kỳ; chỉ tính các tháng giao nhau. Không dùng số dư hôm nay làm tiền lịch sử.',
    field('Tên kế hoạch', `<input name="name" required maxlength="80" value="${h(source.name)}">`, '', true) +
    field('Tháng đầu', `<input name="startMonth" type="month" min="2000-01" max="2100-12" required value="${source.startMonth}">`) +
    field('Tháng cuối', `<input name="endMonth" type="month" min="2000-01" max="2100-12" required value="${source.endMonth}">`),
    async f => {
      const next = changeWindow({ ...source, name: f.name.value }, f.startMonth.value, f.endMonth.value);
      if (isNew || next.startMonth !== plan.startMonth) confirmChange(isNew ? 'Thay toàn bộ bằng kế hoạch trống?' : 'Xem trước đổi tháng đầu', 'Số dư mở kỳ lấy từ mốc tài khoản áp dụng theo ngày, không tự tạo tiền đầu kỳ. Kỳ mới không xóa lịch sử. Hãy xuất bản sao trước khi thay toàn bộ.', () => saveAndClose(next, isNew ? 'replace' : 'edit'));
      else await saveAndClose(next);
    }, 'Lưu', !isNew ? button('Kế hoạch trống mới…', 'new-plan', 'type="button"', 'danger') : '');
}
function monthDialog(month) {
  selectedMonth = month; const m = results().find(m => m.month === month);
  openEditor(`Tháng ${label(month)}`, `${m.reset ? 'Mốc tài khoản' : 'Chuyển từ tháng trước'} · Đầu ${money(m.opening)} · Cuối ${money(m.closing)}${m.incomplete ? ' · Chưa đủ dữ liệu' : ''}${m.closing < 0 ? ' · Số dư âm' : ''}`,
    `<div class="field full"><h3>Thu dự kiến · ${h(flowText(m, 'income'))}</h3>${m.entries.filter(i => i.type === 'income').map(i => `<p>${h(objectName(i.objectId))} · ${h(i.name)}: ${h(money(i.planned))}${!i.included ? ' · Không tính' : ''}</p>`).join('') || '<p>Chưa có khoản thu.</p>'}<h3>Chi dự kiến · ${h(flowText(m, 'expense'))}</h3>${m.entries.filter(i => i.type === 'expense').map(i => `<p>${h(objectName(i.objectId))} · ${h(i.name)}: ${h(money(i.planned))}${!i.included ? ' · Không tính' : ''}</p>`).join('') || '<p>Chưa có khoản chi.</p>'}<h3>Số dư tham chiếu</h3>${m.references.map(a => `<p>${h(a.name)}: ${h(money(a.snapshot?.amount ?? null))} · ${a.snapshot?.date ?? 'Chưa có mốc'}</p>`).join('')}</div>`, null);
}
function prepareMigration(raw, fromServer = false) {
  const source = JSON.parse(raw), next = convertLegacy(source, { confirmed: true });
  migration = { raw, next, fromServer, downloaded: false };
  openEditor('Chuyển nguyên bản v1/v2', 'Không tự chuyển, không dùng lại số thực tế hay tự tạo số dư tài khoản.',
    `<div class="field full"><p>Giữ năm-tháng ${label(next.startMonth)}–${label(next.endMonth)}, ${next.items.length} kế hoạch. Số thực tế và tiền đầu kỳ cũ chỉ nằm trong nguyên bản; KHÔNG tham gia dự báo mới. Số dư mới là chưa biết cho đến khi nhập mốc có ngày.</p><h3>Ánh xạ đối tượng (xem mã để phân biệt)</h3><ul>${next.objects.map(o => `<li>${h(objectLabel(o))} → ${h(next.items.find(i => i.objectId === o.id)?.name)}</li>`).join('')}</ul>${button('Tải nguyên bản trước ↓', 'download-original', 'type="button"')}<label class="toggle"><input name="ack" type="checkbox" required disabled>Tôi đã lưu nguyên bản; đồng ý bỏ số thực tế khỏi kế hoạch hoạt động và dùng ánh xạ trên.</label><p>Khóa trình duyệt không bị xóa. Với bản máy chủ cũ, máy chủ cũng lưu nguyên bản riêng trước khi thay.</p></div>`,
    async () => { if (!migration.downloaded) throw new Error('Tải nguyên bản trước khi xác nhận.'); confirmChange('Thay kế hoạch bằng bản chuyển?', 'Hãy giữ nguyên bản xuất ở nơi an toàn. Việc chuyển chỉ giữ kế hoạch, năm-tháng, mã và các mốc ước tính; không chuyển thực tế hoặc suy đoán số dư tiền.', () => saveAndClose(migration.next, 'replace', !!serverLegacy)); }, 'Xem trước chuyển');
}
function helpDialog() {
  openEditor('Hướng dẫn & khôi phục', 'Ước tính theo tháng, không phải kế toán.', `<div class="field full"><h3>Rõ chi: tháng, nhóm và thẻ</h3><p>Danh sách mặc định chỉ gồm khoản thuộc tháng đang xem. Dùng Xem tất cả lịch đã lưu để sửa khoản ngoài tháng. Ba mức nhóm chọn Đối tượng / người hoặc khóa thẻ khác nhau; Lặp lại / Một lần luôn trong cùng. Thiếu khóa đang nhóm sẽ vào Khác, không tự gán thẻ. Khoản mới bắt đầu không có thẻ; Thêm thẻ để chọn hoặc tạo khóa / giá trị. Gỡ thẻ chỉ bỏ gán; định nghĩa đang dùng không thể xóa. Khóa mới trong biểu mẫu chỉ lưu cùng khoản chi hợp lệ.</p><p>Công tắc Ẩn/Hiện số tiền cụ thể mặc định tắt cho trang và biểu mẫu khoản chi; bật để xem / nhập tiền. Tắt không xóa tiền đã nhập hay lịch sử và không phải kiểm soát quyền truy cập. Tháng, nhóm, tìm kiếm, mở/thu gọn và công tắc chỉ đổi góc nhìn, không lưu vào JSON.</p><h3>Số tiền và số dư</h3><p>Số trống là chưa biết; 0 là đã biết. Nhập 5 nghĩa là 5.000 ₫, nhập 5000 VND là 5.000 ₫. Xem giá trị trước khi lưu. Số dư tài khoản dùng ngày Asia/Ho_Chi_Minh. Mốc mới đặt lại cơ sở gộp; không có mốc mới thì chuyển tiếp. Luôn tính cả kế hoạch tháng cập nhật.</p><h3>Thu chi và công nợ</h3><p>Đối tượng dùng chung, chi tiết thu/chi riêng. Lưu toàn bộ lịch thu/chi, kể cả trước hoặc sau kỳ dự báo; chỉ tính các tháng giao nhau. Đổi kỳ dự báo không cắt hay kéo dài lịch. Chỉnh ước tính từ tháng được chọn và giữ các mốc khác. Công nợ tách khỏi tiền mặt; kế hoạch trả nợ là chi, thu hồi là thu. Không tự giảm dư nợ, không ghi thực tế, tính lãi hoặc ngân hàng.</p><h3>Lưu & khôi phục</h3><p>Một JSON riêng tư trên laptop; mọi thành viên sửa như nhau. Laptop phải chạy và truy cập được qua Tailscale HTTPS riêng tư. Không có sao lưu tự động, không mã hóa ổ đĩa; laptop không phải bản sao lưu. Xuất JSON riêng, giữ an toàn.</p><p>Xung đột/lỗi lưu giữ bản sửa chưa lưu. Xuất trước khi đóng; đọc lại trạng thái trước khi thử lại. Nạp bản máy chủ rồi áp dụng lại bằng tay, không tự gộp. Tệp hỏng/độ bền chưa rõ cần người vận hành; không tự đặt lại hoặc chiếm khóa.</p>${button('Thay bằng mẫu tổng hợp…', 'demo', 'type="button" data-mutate')}</div>`, null);
}
$('#editor').addEventListener('input', updatePreviews);
$('#editor').addEventListener('close', restoreFocus);
$('#editor').addEventListener('submit', async e => {
  e.preventDefault(); if (busy || pending) return;
  try { await submitEditor?.(e.target.elements); }
  catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
});
$('#confirm-form').addEventListener('submit', async e => { e.preventDefault(); const action = confirmAction; confirmAction = null; $('#confirm-dialog').close(); try { await action?.(); } catch (error) { if ($('#editor').open) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; } else toast(error.message); } });
// A queued close event from the previous dialog must not clear a newly opened
// confirmation (e.g. cancel an import, then immediately choose another file).
$('#confirm-dialog').addEventListener('close', () => { if (!$('#confirm-dialog').open) confirmAction = null; });
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements; $('#login-error').hidden = true;
  try {
    csrf = (await api('/api/login', { method: 'POST', body: JSON.stringify({ passphrase: f.passphrase.value }) })).csrf;
    f.passphrase.value = ''; if (!pending) await load(); else render(); authenticated(true);
  } catch (error) { $('#login-error').hidden = false; $('#login-error').textContent = error.status === 429 ? 'Quá nhiều lần thử; chờ 15 phút.' : 'Không đăng nhập/đọc được. Kiểm tra mật khẩu, máy chủ và kết nối riêng tư.'; }
});
$('#settings-button').addEventListener('click', () => setupDialog());
$('#help-button').addEventListener('click', helpDialog);
$('#import-button').addEventListener('click', () => { if (blocked()) return toast('Giải quyết bản chưa lưu / nguyên bản trước.'); $('#import-file').click(); });
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || blocked()) return;
  try {
    if (file.size > MAX_BYTES) throw new Error('Tệp vượt 1 MB.');
    const raw = await file.text(), value = JSON.parse(raw);
    if ([1, 2].includes(value?.version)) { prepareMigration(raw); return; }
    const next = validatePlan(value);
    confirmChange('Thay kế hoạch từ bản nhập?', `${next.name} · ${label(next.startMonth)}–${label(next.endMonth)} · ${next.items.length} khoản. Hãy xuất bản hiện tại trước.`, () => commit(next, 'replace'));
  } catch (error) { toast(error instanceof SyntaxError ? 'JSON không hợp lệ; giữ nguyên dữ liệu.' : error.message); }
});
$('#legacy-button').addEventListener('click', () => { if (busy || pending) return; try { const raw = serverLegacy ? JSON.stringify(serverLegacy, null, 2) : localStorage.getItem(KEY); if (raw) prepareMigration(raw, !!serverLegacy); } catch (error) { toast(error.message); } });
$('#export-button').addEventListener('click', async () => {
  try { const source = pending ? pending.candidate : await api('/api/export'); download(JSON.stringify(source ?? plan, null, 2), `money-seasons-${pending ? 'UNSAVED' : 'original-plan'}.json`); toast('Bản xuất không mã hóa; giữ ở nơi an toàn.'); } catch { toast('Không xuất được. Kiểm tra đăng nhập / kết nối.'); }
});
$('#reconcile-button').addEventListener('click', async () => {
  if (!pending) return;
  try {
    const saved = await api('/api/plan');
    if (saved.durabilityUncertain) { pending.checked = false; warning('Độ bền CHƯA XÁC NHẬN. Xuất bản sửa; cần người vận hành kiểm tra và khởi động lại.'); }
    else if (JSON.stringify(saved.plan) === JSON.stringify(pending.candidate)) { revision = saved.revision; pending = null; initialized = true; serverLegacy = null; warning('Đã đọc lại: máy chủ giữ đúng bản sửa.'); }
    else if (saved.revision === pending.revision) { pending.checked = true; warning('Máy chủ vẫn giữ bản trước. Có thể thử lưu lại sau khi đọc lại, với kiểm tra phiên bản.'); }
    else { pending.checked = false; warning(`Máy chủ có phiên bản ${saved.revision}. Xuất bản sửa, nạp bản máy chủ và áp dụng lại bằng tay.`); }
    renderStatus();
  } catch { toast('Chưa đọc lại được. Bản sửa vẫn giữ.'); }
});
$('#retry-button').addEventListener('click', async () => { if (!pending?.checked) return; const draft = pending; pending = null; await commit(draft.candidate, draft.operation, draft.migrationConfirmed); });
$('#reload-button').addEventListener('click', () => confirmChange('Nạp bản máy chủ?', 'Bản chưa lưu sẽ rời bộ nhớ. Xuất trước. Ô biểu mẫu được giữ để kiểm tra/áp dụng lại bằng tay.', load));
$('#logout-button').addEventListener('click', () => confirmChange('Đăng xuất?', 'Bản chưa lưu sẽ rời bộ nhớ. Hãy xuất trước.', async () => { await api('/api/logout', { method: 'POST', body: '{}' }); location.reload(); }));
document.addEventListener('input', e => {
  if (e.target.id === 'expense-search') {
    const position = e.target.selectionStart; expenseSearch = e.target.value; render();
    const input = $('#expense-search'); input.focus(); if (position !== null) input.setSelectionRange(position, position);
  }
});
document.addEventListener('change', e => {
  if (e.target.hasAttribute('data-amount-visibility')) { showExpenseAmounts = e.target.checked; syncExpenseVisibility(); }
  if (e.target.hasAttribute('data-group-level')) { const level = Number(e.target.dataset.groupLevel); expenseGroups[level] = e.target.value; renderAndFocus(`[data-group-level="${level}"]`); }
  if (e.target.name === 'repeat' || e.target.name === 'expenseKind') updateScheduleFields();
  if (e.target.hasAttribute('data-tag-key')) {
    const row = e.target.closest('[data-tag-row]'), key = tagLibrary(plan).find(k => k.id === e.target.value);
    row.querySelector('[data-tag-value-fields]').innerHTML = tagValueFields(key); updateTagRows();
  }
  if (e.target.hasAttribute('data-tag-value')) updateTagRows();
  if (e.target.name === 'manageKey') updateManagedKey();
  if (e.target.name === 'manageValue') updateManagedValue();
  if (e.target.id === 'include-tentative') { tentative = e.target.checked; renderAndFocus('#include-tentative'); }
  if (e.target.id === 'view-month') { selectedMonth = e.target.value; renderAndFocus('#view-month'); }
  // Effective-month changes load that occurrence's estimate, not a different month's amount.
  if (e.target.name === 'effectiveMonth' && $('#edit-form [name=amount]')) {
    const id = $('#edit-form').dataset.itemId, item = plan.items.find(i => i.id === id);
    if (item && occurs(item, e.target.value)) { $('#edit-form [name=amount]').value = formatAmountInput(plannedAmount(item, e.target.value)); updatePreviews(); }
  }
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-add-tag]') && !blocked()) { $('#expense-tag-rows').insertAdjacentHTML('beforeend', tagRow()); updateTagRows(); $$('#editor [data-tag-key]').at(-1).focus(); return; }
  if (e.target.closest('[data-remove-tag]') && !blocked()) { e.target.closest('[data-tag-row]').remove(); updateTagRows(); $('#editor [data-add-tag]').focus(); return; }
  if (e.target.closest('[data-delete-tag-key]') && !blocked()) { void deleteManagedTag(); return; }
  if (e.target.closest('[data-delete-tag-value]') && !blocked()) { void deleteManagedTag(true); return; }
  const close = e.target.closest('[data-close]'); if (close) { close.closest('dialog').close(); return; }
  const nav = e.target.closest('[data-view]'); if (nav) { view = nav.dataset.view; render(); return; }
  const disclosure = e.target.closest('[data-collapse], [data-collapse-all]');
  if (disclosure) { toggleCollapse(disclosure); return; }
  const target = e.target.closest('[data-action]'); if (!target) return;
  const { action, id, kind, object, month, debt, date } = target.dataset;
  if (target.hasAttribute('data-mutate') && blocked()) return;
  if (action === 'tags') tagManager();
  if (action === 'previous-month' || action === 'next-month') { const months = range(); selectedMonth = months[Math.max(0, Math.min(months.length - 1, months.indexOf(selectedMonth) + (action === 'next-month' ? 1 : -1)))]; render(); ($(`[data-action="${action}"]:not(:disabled)`) ?? $('#view-month')).focus({ preventScroll: true }); }
  if (action === 'all-expense-schedules') { allExpenseSchedules = !allExpenseSchedules; renderAndFocus('[data-action=all-expense-schedules]'); }
  if (action === 'object') objectDialog(id);
  if (action === 'item') { itemDialog({ id, kind, objectId: object, month: month ?? selectedMonth, repeatKind: target.dataset.repeatKind }); }
  if (action === 'delete-object') {
    if (plan.items.some(i => i.objectId === id)) return toast('Đối tượng còn chi tiết; hãy chuyển hoặc xóa từng chi tiết trước.');
    confirmChange('Xóa đối tượng trống?', 'Không xóa bất kỳ chi tiết nào. Đối tượng dùng chung sẽ rời cả hai trang.', () => commit({ ...plan, objects: plan.objects.filter(o => o.id !== id) }));
  }
  if (action === 'delete-item') confirmChange('Xóa chi tiết và lịch dự kiến?', 'Chỉ xóa khoản này, gồm các mốc ước tính; giữ đối tượng và mọi khoản khác.', () => commit({ ...plan, items: plan.items.filter(i => i.id !== id) }));
  if (action === 'account') accountDialog(id, debt === 'true');
  if (action === 'snapshot') snapshotDialog(id, debt === 'true', date);
  if (action === 'debt-plan') { const a = plan.debtAccounts.find(a => a.id === id); itemDialog({ kind: a.direction === 'payable' ? 'expense' : 'income', suggestion: `${a.direction === 'payable' ? 'Trả nợ' : 'Thu hồi'} · ${a.name}` }); }
  if (action === 'table' || action === 'cards') { table = action === 'table'; render(); }
  if (action === 'month') monthDialog(month);
  if (action === 'new-plan') { $('#editor').close(); setupDialog(true); }
  if (action === 'demo') confirmChange('Thay bằng dữ liệu mẫu?', 'Thay toàn bộ bằng tên/số liệu tổng hợp; xuất bản hiện tại trước.', () => saveAndClose(demoPlan(), 'replace'));
  if (action === 'download-original' && migration) { download(migration.raw, 'money-seasons-original-legacy.json'); migration.downloaded = true; $('#edit-form [name=ack]').disabled = false; }
});
window.addEventListener('beforeunload', e => { if (pending || busy) { e.preventDefault(); e.returnValue = ''; } });
try { csrf = (await api('/api/session')).csrf; await load(); authenticated(true); }
catch { authenticated(false); }
