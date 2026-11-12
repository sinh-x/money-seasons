// Browser-only helpers. All inputs below are already server-filtered projections;
// no raw household or credential configuration is ever fetched by this module.
import { blankPlan, validatePlan, convertLegacy } from './model.js';
export function ownerPlan(home, ownerId) {
  const decode = value => {
    const p = home.provenance.find(p => p.id === value && p.ownerId === ownerId);
    if (!p) throw new Error('Không còn quyền đối với mã này.');
    return p.sourceId;
  };
  const plan = { ...blankPlan(home.plan.startMonth, home.plan.endMonth), name: 'Bản chia sẻ', tagDefinitions: [] };
  for (const kind of ['objects', 'items', 'accounts', 'snapshots', 'debtAccounts', 'debtSnapshots', 'tagDefinitions']) {
    plan[kind] = (home.plan[kind] ?? []).filter(r => home.provenance.some(p => p.kind === kind && p.id === r.id && p.ownerId === ownerId)).map(r => ({ ...structuredClone(r), id: decode(r.id),
      ...('objectId' in r ? { objectId: decode(r.objectId) } : {}), ...('accountId' in r ? { accountId: decode(r.accountId) } : {}),
      ...('tags' in r ? { tags: r.tags.map(t => ({ keyId: decode(t.keyId), valueId: decode(t.valueId) })) } : {}),
      ...('values' in r ? { values: r.values.map(v => ({ ...v, id: decode(v.id) })) } : {}) }));
  }
  return validatePlan(plan);
}
export function recordDiff(before, after, ownerId) {
  // Collaborators may change one source record, not supporting metadata. Whole
  // source replacement is reserved for the authenticated owner's own endpoint.
  for (const key of ['objects', 'tagDefinitions', 'startMonth', 'endMonth', 'name', 'demo']) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error('Chỉ chủ sở hữu được sửa đối tượng / định nghĩa thẻ.');
  }
  const changes = [];
  for (const kind of ['items', 'accounts', 'debtAccounts', 'snapshots', 'debtSnapshots']) {
    for (const r of before[kind]) {
      const value = after[kind].find(n => n.id === r.id);
      if (!value) changes.push({ ownerId, kind, id: r.id, action: 'delete', confirmed: true });
      else if (JSON.stringify(r) !== JSON.stringify(value)) changes.push({ ownerId, kind, id: r.id, action: 'update', value, confirmed: true });
    }
    for (const value of after[kind].filter(r => !before[kind].some(n => n.id === r.id))) changes.push({ ownerId, kind, id: value.id, action: 'create', value, confirmed: true });
  }
  if (changes.length !== 1) throw new Error('Mỗi lần chỉ sửa một bản ghi chia sẻ.');
  return changes[0];
}
export function memberDialogs({ api, member, openEditor, field, h, confirmChange, load, plan, revision, toast, clear }) {
  const post = async (route, input) => { await api(route, { method: 'POST', body: JSON.stringify(input) }); document.querySelector('#editor').close(); await load(); };
  return {
    async password() {
      const own = await api('/api/member');
      openEditor('Đổi mật khẩu của tôi', 'Tối thiểu 12 ký tự. Phiên cũ bị thu hồi sau khi lưu.',
        field('Mật khẩu hiện tại', '<input name="currentPassword" type="password" autocomplete="current-password" required>', '', true) + field('Mật khẩu mới', '<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required>', '', true),
        async f => { await api('/api/password', { method: 'POST', body: JSON.stringify({ expectedRevision: own.revision, currentPassword: f.currentPassword.value, password: f.password.value }) }); clear(); toast('Đã đổi mật khẩu. Đăng nhập lại.'); });
    },
    async users() {
      const state = await api('/api/users');
      openEditor('Quản lý thành viên', 'Quyền admin do cấu hình riêng của người vận hành. Đặt lại mật khẩu là quyền tin cậy; admin không có quyền đọc tài chính riêng qua API.',
        `<div class="field full"><ul>${state.users.map(u => `<li>${h(u.name)} · ${h(u.id)} · ${u.admin ? 'Admin' : 'Thành viên'} · ${u.enabled ? 'Hoạt động' : 'Đã khóa'}</li>`).join('')}</ul></div>` +
        field('Thao tác', '<select name="action"><option value="create">Tạo thành viên</option><option value="reset">Đặt lại mật khẩu</option><option value="disable">Khóa truy cập</option><option value="enable">Mở lại truy cập</option></select>') +
        field('Mã thành viên', '<input name="id" pattern="[a-z0-9][a-z0-9_-]{0,63}" required>') + field('Tên đăng nhập (khi tạo)', '<input name="username" maxlength="64">') + field('Tên hiển thị (khi tạo)', '<input name="name" maxlength="80">') + field('Mật khẩu mới (tạo / đặt lại)', '<input name="password" type="password" autocomplete="new-password" maxlength="1024">', '', true),
        async f => {
          const action = f.action.value, input = { expectedRevision: state.revision, id: f.id.value, action: ['disable', 'enable'].includes(action) ? 'access' : action,
            ...(action === 'create' ? { username: f.username.value, name: f.name.value, password: f.password.value } : action === 'reset' ? { password: f.password.value } : { enabled: action === 'enable' }) };
          confirmChange('Xác nhận quản lý truy cập?', `${action} · ${f.id.value}. Không thay đổi dữ liệu tài chính hoặc chủ sở hữu.`, () => post('/api/users', input));
        });
    },
    period() {
      const current = plan(), expectedRevision = revision();
      openEditor('Kỳ dự báo chung', 'Áp dụng cho mọi người và Home. Không cắt / đổi lịch, mốc ước tính hay lịch sử số dư.',
        field('Tháng đầu', `<input name="startMonth" type="month" min="2000-01" max="2100-12" required value="${current.startMonth}">`) + field('Tháng cuối', `<input name="endMonth" type="month" min="2000-01" max="2100-12" required value="${current.endMonth}">`),
        async f => confirmChange('Đổi kỳ dự báo của cả Home?', `${f.startMonth.value} → ${f.endMonth.value}. Giữ toàn bộ lịch đã lưu.`, () => post('/api/period', { expectedRevision, startMonth: f.startMonth.value, endMonth: f.endMonth.value, confirmed: true })));
    },
    async migration() {
      const [original, users] = await Promise.all([api('/api/migration'), api('/api/users')]);
      const converted = original.plan.version === 3 ? validatePlan(original.plan) : convertLegacy(original.plan, { confirmed: true });
      openEditor('Chuyển nguyên bản · chọn cá nhân sở hữu', 'Không suy đoán admin là chủ sở hữu. Máy chủ lưu nguyên bản chính xác trước khi chuyển. v1/v2 không chuyển số thực tế / tiền đầu kỳ thiếu ngày; hãy xem và xuất nguyên bản trước.',
        `<div class="field full"><p>Bản v${original.plan.version} · ${h(original.plan.name)} · ${original.plan.items.length} khoản · ${h(original.plan.startMonth)} → ${h(original.plan.endMonth)}. Tất cả bản ghi chuyển mặc định chia sẻ.</p><h3>Ánh xạ sẽ chuyển · không lưu khi xem trước</h3><ul>${converted.items.map(i => `<li>${h(i.id)} · ${h(i.name)} → ${h(converted.objects.find(o => o.id === i.objectId)?.name)} [${h(i.objectId)}]</li>`).join('')}</ul><details><summary>Nguyên bản trước chuyển</summary><pre class="migration-preview">${h(JSON.stringify(original.plan, null, 2))}</pre></details><details><summary>Kế hoạch v3 sẽ gán cho cá nhân</summary><pre class="migration-preview">${h(JSON.stringify(converted, null, 2))}</pre></details></div>` + field('Cá nhân được chọn rõ ràng', `<select name="ownerId" required><option value="">Chọn chủ sở hữu…</option>${users.users.filter(u => u.enabled).map(u => `<option value="${h(u.id)}">${h(u.name)} · ${h(u.id)}</option>`).join('')}</select>`, '', true) + field('Xác nhận nguyên bản', '<input type="checkbox" name="ack" required> Tôi đã xem ánh xạ và đồng ý mặc định chia sẻ.', '', true),
        async f => confirmChange('Chuyển dữ liệu cho cá nhân đã chọn?', `Chủ sở hữu: ${f.ownerId.value}. Giữ nguyên mã, lịch và thẻ; lưu tệp nguyên bản trước khi chuyển.`, () => post('/api/migration', { expectedRevision: original.revision, ownerId: f.ownerId.value, confirmed: true })));
    }
  };
}
