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

/* ---------- تصدير إكسيل منسّق (ExcelJS) ---------- */
// تاريخ إكسيل بتوقيت جهازك (إكسيل مفيهوش timezone فبنكتب الوقت المحلي كأنه UTC)
function xlD(iso){
  const d = new Date(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
}
const XL = {
  ink: 'FF2E2A22', brand: 'FFC9962B', head: 'FF3B2F1E', band: 'FFFCFAF4', total: 'FFF1E6C3',
  label: 'FFF6EFD9', line: 'FFD9CFB4', debit: 'FF9E3A2B', credit: 'FF2E7D4F',
  money: '#,##0.00', qty: '#,##0.##', date: 'yyyy-mm-dd  hh:mm', pct: '0.0"%"',
};
const _colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const _border = { top: { style: 'thin', color: { argb: XL.line } }, left: { style: 'thin', color: { argb: XL.line } }, bottom: { style: 'thin', color: { argb: XL.line } }, right: { style: 'thin', color: { argb: XL.line } } };

// بيعمل ورقة منسّقة:
// o = { title, subtitle, stats:[{label,value,fmt,color}], cols:[{h,k,w,t,color,wrap}], rows:[{...}],
//       balance:{key,plus,minus}, total:{labelKey, sums:[keys], balKey}, groupKey }
// أنواع الأعمدة t: date | money | qty | pct | int | text
function xlTable(wb, name, o){
  const base = (name || 'ورقة').replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 28) || 'ورقة';
  let sname = base, i = 2;
  while (wb.getWorksheet(sname)) { sname = base.slice(0, 25) + '_' + i; i++; }
  const ws = wb.addWorksheet(sname, {
    properties: { tabColor: { argb: XL.brand } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  const cols = o.cols, n = cols.length;
  ws.columns = cols.map(c => ({ width: c.w || 14 }));
  const font = (extra) => Object.assign({ name: 'Arial', size: 11, color: { argb: XL.ink } }, extra || {});
  let r = 1;

  // العنوان
  ws.mergeCells(r, 1, r, n);
  let c = ws.getCell(r, 1);
  c.value = o.title || name;
  c.font = font({ size: 16, bold: true, color: { argb: 'FFFFFFFF' } });
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.brand } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 30; r++;
  if (o.subtitle) {
    ws.mergeCells(r, 1, r, n);
    c = ws.getCell(r, 1); c.value = o.subtitle;
    c.font = font({ size: 11, color: { argb: 'FF6B6048' } });
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 20; r++;
  }
  // مربعات الملخص (الإجماليات)
  if (o.stats && o.stats.length) {
    r++;
    // نوزّع المربعات على الأعمدة بحسب عرضها (عشان عمود "#" الضيق ما ياخدش مربع لوحده)
    const k0 = Math.min(o.stats.length, n), widths = cols.map(c => c.w || 14), totalW = widths.reduce((x, y) => x + y, 0);
    const groups = []; let gStart = 1, acc = 0;
    for (let ci = 1; ci <= n; ci++) {
      acc += widths[ci - 1];
      if (groups.length < k0 - 1 && acc >= totalW * (groups.length + 1) / k0) { groups.push([gStart, ci]); gStart = ci + 1; }
    }
    if (gStart <= n) groups.push([gStart, n]);
    const k = groups.length;
    o.stats.slice(0, k).forEach((st, idx) => {
      const c1 = groups[idx][0], c2 = groups[idx][1];
      [r, r + 1].forEach((rr, j) => {
        if (c2 > c1) ws.mergeCells(rr, c1, rr, c2);
        const cell = ws.getCell(rr, c1);
        cell.value = j === 0 ? st.label : st.value;
        if (j === 0) { cell.font = font({ size: 10, color: { argb: 'FF6B6048' } }); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.label } }; }
        else { cell.font = font({ size: 14, bold: true, color: { argb: st.color || XL.ink } }); if (typeof st.value === 'number') cell.numFmt = st.fmt || XL.money; }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let cc = c1; cc <= c2; cc++) ws.getCell(rr, cc).border = _border;
      });
    });
    ws.getRow(r).height = 18; ws.getRow(r + 1).height = 26;
    r += 2;
  }
  r++;
  const hdr = r;
  cols.forEach((col, ci) => {
    const cell = ws.getCell(hdr, ci + 1);
    cell.value = col.h;
    cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.head } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = _border;
  });
  ws.getRow(hdr).height = 26;
  r++;

  const idxOf = (key) => cols.findIndex(x => x.k === key) + 1;
  const rows = o.rows || [];
  const first = r;
  const bal = o.balance ? { c: idxOf(o.balance.key), p: idxOf(o.balance.plus), m: o.balance.minus ? idxOf(o.balance.minus) : 0 } : null;
  let prevBalRow = null, band = 0, lastG;
  rows.forEach((row) => {
    if (o.groupKey) { if (row[o.groupKey] !== lastG) { band++; lastG = row[o.groupKey]; } } else band++;
    let maxLines = 1;
    cols.forEach((col, ci) => {
      const cell = ws.getCell(r, ci + 1);
      let v = row[col.k];
      if (v === undefined || v === null || v === '') v = null;
      if (col.t === 'date' && v) v = (v instanceof Date) ? v : xlD(v);
      cell.value = v;
      cell.font = font({ bold: !!row._bold || (bal && ci + 1 === bal.c) });
      cell.border = _border;
      if (band % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.band } };
      if (row._fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row._fill } };
      if (col.t === 'money') cell.numFmt = XL.money;
      else if (col.t === 'qty') cell.numFmt = XL.qty;
      else if (col.t === 'pct') cell.numFmt = XL.pct;
      else if (col.t === 'date') cell.numFmt = XL.date;
      if (col.t === 'text' || !col.t) {
        cell.alignment = { horizontal: col.wrap ? 'right' : 'center', vertical: 'middle', wrapText: !!col.wrap };
        if (col.wrap && typeof v === 'string') {
          const lines = v.split('\n').reduce((s, ln) => s + Math.max(1, Math.ceil(ln.length / ((col.w || 14) * 1.05))), 0);
          if (lines > maxLines) maxLines = lines;
        }
      } else cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (col.color === 'debit' && v) cell.font = font({ bold: true, color: { argb: XL.debit } });
      if (col.color === 'credit' && v) cell.font = font({ bold: true, color: { argb: XL.credit } });
      if (col.color === 'sign' && typeof v === 'number') cell.font = font({ bold: true, color: { argb: v > 0.004 ? XL.debit : XL.credit } });
    });
    // الرصيد المتحرك: معادلة حقيقية (لو عدّلت رقم في الإكسيل الرصيد يتحدّث)
    if (bal && !row._open) {
      const L = _colL;
      const f = (prevBalRow ? `${L(bal.c)}${prevBalRow}+` : '') + `N(${L(bal.p)}${r})` + (bal.m ? `-N(${L(bal.m)}${r})` : '');
      const cell = ws.getCell(r, bal.c);
      const val = row[o.balance.key];
      cell.value = { formula: f, result: typeof val === 'number' ? val : 0 };
    }
    if (bal) {
      const cell = ws.getCell(r, bal.c), val = row[o.balance.key];
      cell.numFmt = XL.money;
      const bad = o.balance.posGood ? (typeof val === 'number' && val < -0.004) : (typeof val === 'number' && val > 0.004);
      cell.font = font({ bold: true, color: { argb: bad ? XL.debit : XL.credit } });
      prevBalRow = r;
    }
    if (maxLines > 1) ws.getRow(r).height = Math.min(300, maxLines * 15 + 6);
    r++;
  });
  const last = r - 1;
  if (!rows.length) {
    ws.mergeCells(r, 1, r, n);
    const cell = ws.getCell(r, 1); cell.value = 'لا توجد بيانات في هذه الفترة';
    cell.font = font({ color: { argb: 'FF867A63' } }); cell.alignment = { horizontal: 'center' };
    r++;
  }
  // صف الإجمالي
  if (o.total && rows.length) {
    const t = o.total, L = _colL;
    for (let ci = 1; ci <= n; ci++) {
      const cell = ws.getCell(r, ci);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.total } };
      cell.border = { top: { style: 'medium', color: { argb: XL.head } }, bottom: _border.bottom, left: _border.left, right: _border.right };
      cell.font = font({ bold: true }); cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    const lc = idxOf(t.labelKey) || 1;
    ws.getCell(r, lc).value = t.label || 'الإجمالي';
    (t.sums || []).forEach((key) => {
      const ci = idxOf(key); if (!ci) return;
      const total = rows.filter(x => !x._open && !x._nosum).reduce((s, x) => s + (typeof x[key] === 'number' ? x[key] : 0), 0);
      const cell = ws.getCell(r, ci);
      cell.value = { formula: `SUM(${L(ci)}${first}:${L(ci)}${last})`, result: Math.round(total * 100) / 100 };
      const ty = cols[ci - 1].t; cell.numFmt = ty === 'qty' ? XL.qty : (ty === 'int' ? '0' : XL.money);
    });
    if (t.balKey && bal) {
      const lastVal = rows[rows.length - 1][o.balance.key];
      const cell = ws.getCell(r, bal.c);
      cell.value = { formula: `${L(bal.c)}${last}`, result: lastVal };
      cell.numFmt = XL.money;
      const badEnd = o.balance.posGood ? lastVal < -0.004 : lastVal > 0.004;
      cell.font = font({ bold: true, size: 12, color: { argb: badEnd ? XL.debit : XL.credit } });
    }
    (t.custom || []).forEach((cu) => { const ci = idxOf(cu.key); if (!ci) return; const cell = ws.getCell(r, ci); cell.value = cu.formula ? { formula: cu.formula(r, first, last), result: typeof cu.result === 'function' ? cu.result(rows) : cu.result } : cu.value; cell.numFmt = cu.fmt || XL.money; });
    ws.getRow(r).height = 24;
  }
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: hdr, showGridLines: false }];
  if (rows.length) ws.autoFilter = { from: { row: hdr, column: 1 }, to: { row: last, column: n } };
  ws.pageSetup.printTitlesRow = `${hdr}:${hdr}`;
  ws.headerFooter = { oddFooter: '&C&"Arial"صفحة &P من &N' };
  return ws;
}

async function xlDownload(wb, filename){
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\\/\?\*\[\]:"<>|]/g, '_') + '.xlsx';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
// builder: (wb) => void — بيضيف الورق عن طريق xlTable
// تحميل مكتبة الإكسيل عند الطلب (لو ما اتحمّلتش مع الصفحة): من الموقع نفسه، وبعدها من CDN احتياطي
function _loadScript(src){
  return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(el); });
}
async function xlEnsureLib(){
  if (typeof ExcelJS !== 'undefined') return true;
  for (const src of ['vendor/exceljs.min.js', 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js']) {
    try { await _loadScript(src); if (typeof ExcelJS !== 'undefined') return true; } catch (e) {}
  }
  return false;
}
async function xlExport(filename, builder){
  if (!(await xlEnsureLib())) { showToast('مش قادر أحمّل مكتبة الإكسيل — اتأكد من الإنترنت وحدّث الصفحة (Ctrl+F5)'); return; }
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'دفتر حساب الجبنة'; wb.created = new Date();
    wb.views = [{ rightToLeft: true }];
    wb.calcProperties = { fullCalcOnLoad: true };   // إكسيل يعيد حساب المعادلات أول ما يفتح الملف
    builder(wb);
    await xlDownload(wb, filename);
    showToast('اتصدّر ملف الإكسيل');
  } catch (e) { console.error(e); showToast('فشل تصدير الإكسيل: ' + (e && e.message ? e.message : e)); }
}
// شريط أزرار التصدير: الفترة المعروضة أو كل التفاصيل
function exportBar(fn, arg){
  const a = arg !== undefined ? `'${arg}',` : '';
  return `<div class="exportbar"><span>📥 تصدير إكسيل:</span>
    <button onclick="${fn}(${a}false)">الفترة المعروضة</button>
    <button onclick="${fn}(${a}true)">كل التفاصيل</button></div>`;
}
