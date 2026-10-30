/* ===== ui.js: أدوات مشتركة (أرقام عربي/إنجليزي، نافذة التعديل، تصدير إكسيل) ===== */

// تحويل الأرقام العربية (٠-٩) والفارسية (۰-۹) لأرقام إنجليزية
function normDigits(s){
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
}
// قراءة رقم من أي نص: بتفهم الأرقام العربي والإنجليزي والفاصلة العشرية (٫ أو , أو .)
// بترجّع NaN لو النص فاضي أو مش رقم (زي parseFloat بالظبط)
function num(v){
  if (typeof v === 'number') return v;
  let s = normDigits(v).trim().replace(/\s+/g, '');
  if (!s) return NaN;
  s = s.replace(/٫/g, '.').replace(/٬/g, '').replace(/،/g, ',');
  if (!s.includes('.') && /^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');   // 2,5 = 2.5
  s = s.replace(/,/g, '');                                                       // 1,000 = 1000
  return parseFloat(s);
}

// خانات الأرقام: أي رقم عربي بيتحوّل لإنجليزي وإنت بتكتب، والحروف الغلط بتتشال
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || t.tagName !== 'INPUT' || t.getAttribute('inputmode') !== 'decimal') return;
  const v = t.value;
  const nv = normDigits(v).replace(/[٫]/g, '.').replace(/[،٬]/g, ',').replace(/[^0-9.,\-]/g, '');
  if (nv !== v) {
    const pos = t.selectionStart;
    t.value = nv;
    try { t.setSelectionRange(pos, pos); } catch (_) {}
  }
}, true);

// أول ما تدوس على خانة رقم فيها قيمة، القيمة بتتحدد كلها، فتكتب فوقها من غير ما تمسح
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t && t.tagName === 'INPUT' && t.getAttribute('inputmode') === 'decimal' && t.value) {
    setTimeout(() => { try { t.select(); } catch (_) {} }, 0);
  }
});

/* ---------- نافذة التعديل ---------- */
// fields: [{key,label,type:'text'|'num'|'area'|'date'|'select'|'check'|'info', value, options?}]
function openEditModal({ title, fields, onSave }){
  closeEditModal();
  const ov = document.createElement('div');
  ov.className = 'modal-ov'; ov.id = 'editModal';
  const fieldHtml = (f) => {
    const id = 'ef_' + f.key;
    const v = f.value == null ? '' : f.value;
    if (f.type === 'info') return `<div class="stage-note" style="margin:0;">${esc(String(v))}</div>`;
    if (f.type === 'check') return `<label class="chk"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    let input;
    if (f.type === 'area') input = `<textarea id="${id}" rows="3" placeholder="${esc(f.label)}">${esc(String(v))}</textarea>`;
    else if (f.type === 'select') input = `<select id="${id}">${f.options.map(o => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
    else if (f.type === 'date') input = `<input type="date" id="${id}" value="${esc(String(v))}">`;
    else if (f.type === 'num') input = `<input type="text" inputmode="decimal" autocomplete="off" id="${id}" value="${esc(String(v))}" placeholder="${esc(f.label)}">`;
    else input = `<input type="text" id="${id}" value="${esc(String(v))}" placeholder="${esc(f.label)}">`;
    return `<div><label>${esc(f.label)}</label>${input}</div>`;
  };
  ov.innerHTML = `<div class="modal">
      <h3>${esc(title)}</h3>
      <div class="modal-body">${fields.map(fieldHtml).join('')}</div>
      <div class="modal-act">
        <button class="btn btn-ghost" id="efCancel">إلغاء</button>
        <button class="btn btn-cheese" id="efSave">حفظ التعديل</button>
      </div></div>`;
  document.body.appendChild(ov);

  const collect = () => {
    const out = {};
    fields.forEach(f => {
      if (f.type === 'info') return;
      const el = document.getElementById('ef_' + f.key);
      out[f.key] = f.type === 'check' ? el.checked : (f.type === 'num' ? num(el.value) : el.value);
    });
    return out;
  };
  let busy = false;
  const save = async () => {
    if (busy) return; busy = true;
    try { await onSave(collect()); closeEditModal(); }
    catch (e) { /* الرسالة اتعرضت، النافذة تفضل مفتوحة */ }
    finally { busy = false; }
  };
  document.getElementById('efSave').onclick = save;
  document.getElementById('efCancel').onclick = closeEditModal;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeEditModal(); });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); save(); }
  });
  const first = ov.querySelector('input:not([type=date]),textarea,select'); if (first) first.focus();
}
function closeEditModal(){ const m = document.getElementById('editModal'); if (m) m.remove(); }
// يركّب التاريخ الجديد مع الوقت الأصلي (null لو التاريخ ما اتغيّرش)
function composeDate(dayStr, origIso){
  if (!dayStr || dayStr === localDateStr(origIso)) return null;
  const o = new Date(origIso), [y, m, d] = dayStr.split('-').map(Number);
  return new Date(y, m - 1, d, o.getHours(), o.getMinutes(), o.getSeconds()).toISOString();
}

/* ---------- تصدير إكسيل ---------- */
function xlDate(iso){
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
// sheets: [{name, rows:[{عمود: قيمة}]}]
function xlSave(filename, sheets){
  if (typeof XLSX === 'undefined') { showToast('مكتبة الإكسيل لسه بتحمّل، جرّب تاني بعد ثواني'); return; }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  sheets.forEach((sh) => {
    const rows = sh.rows && sh.rows.length ? sh.rows : [{ 'ملاحظة': 'لا توجد بيانات' }];
    const keys = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: keys });
    ws['!cols'] = keys.map(k => ({ wch: Math.min(60, Math.max(String(k).length, ...rows.map(r => String(r[k] == null ? '' : r[k]).length)) + 2) }));
    const base = (sh.name || 'ورقة').replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 28) || 'ورقة';
    let name = base, n = 2;
    while (used.has(name)) { name = base.slice(0, 25) + '_' + n; n++; }
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  wb.Workbook = { Views: [{ RTL: true }] };   // الشيت يفتح من اليمين لليسار
  XLSX.writeFile(wb, filename.replace(/[\\\/\?\*\[\]:"<>|]/g, '_') + '.xlsx');
  showToast('اتصدّر ملف الإكسيل');
}
// شريط أزرار التصدير: الفترة المعروضة أو كل التفاصيل
function exportBar(fn, arg){
  const a = arg !== undefined ? `'${arg}',` : '';
  return `<div class="exportbar"><span>📥 تصدير إكسيل:</span>
    <button onclick="${fn}(${a}false)">الفترة المعروضة</button>
    <button onclick="${fn}(${a}true)">كل التفاصيل</button></div>`;
}
