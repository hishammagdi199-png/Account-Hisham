/* ===== features.js =====
   إضافات فوق النسخة الحالية (من غير ما نلمس الملفات الكبيرة):
   1) مرتجع من العميل / مرتجع للمورد — بيتخصم من الحساب ومبيأثرش على الخزنة
   2) تعديل فاتورة المورد كاملة (الأصناف والكميات والأسعار والتاريخ)
   3) اختيار عميل تاني من جوه صفحة العميل (تحت شريط التاريخ)
   4) تحصيل مع الفاتورة + تحصيل من غير فاتورة (زرار فوق)
   5) صفحة العميل من غير كارت واتساب ولا كارت «تسجيل دفعة»
   6) كروت بسهم تتفتح وتتقفل: «تسجيل حركة مع المورد» + «الأصناف والأسعار» + «العملاء» في الرئيسية
   لازم يتحمّل بعد باقي ملفات الـ JS (آخر سطر في index.html)
*/

(function injectStyles(){
  const st = document.createElement('style');
  st.textContent = [
    '.tag.ret{background:#E1EAF6;color:#2F5D8C;}',
    '.ret-card{border-color:#BCD0EA;background:#F5F8FD;}',
    '.qa-bar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px;}',
    '.fx-client-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;}',
    '.fx-client-row label{margin:0;font-weight:700;white-space:nowrap;}',
    '.fx-client-pick{width:auto;flex:1;min-width:200px;max-width:380px;font-weight:700;}',
    '.fx-collhead{cursor:pointer;user-select:none;}',
    '.fx-arrow{display:inline-block;width:16px;margin-left:6px;font-size:12px;color:var(--ink-soft);}',
    '.fx-pay{margin-top:10px;max-width:420px;}',
    '.fx-pay-note{font-weight:700;margin:6px 0 0;}',
  ].join('\n');
  document.head.appendChild(st);
})();

/* ---------- أدوات داخلية ---------- */
const FXRET = { clients: [], suppliers: [] };   // المرتجعات (في متغير لوحده عشان state بيتبدّل كله مع كل تحميل)
let fxRendered = false;
let draftPay = '', stagedPay = '';

// بيغلّف دالة موجودة (من غير ما نعدّل ملفها): wrapper(orig, arguments)
function fxWrap(name, wrapper){
  const orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = function(){ return wrapper.call(this, orig, arguments); };
}
function fxDayIso(day){
  if (!day || day === todayStr()) return new Date().toISOString();
  const t = new Date(), [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}
function clientReturnsOf(id){ return FXRET.clients.filter((r) => r.clientId === id); }
function supplierReturnsOf(id){ return FXRET.suppliers.filter((r) => r.supplierId === id); }
function retSum(list){ return r2(sumBy(list, (r) => r.total)); }

/* ---------- تحميل المرتجعات مع الصفحة ---------- */
async function loadExtras(){
  const json = await apiFetch('extras', 'GET');
  const d = (json && json.data) || {};
  FXRET.clients = d.clientReturns || [];
  FXRET.suppliers = d.supplierReturns || [];
}
fxWrap('render', function(orig, args){ fxRendered = true; return orig.apply(this, args); });
fxWrap('showLoadError', function(orig, args){ fxRendered = false; return orig.apply(this, args); });
fxWrap('loadState', async function(orig, args){
  await orig.apply(this, args);
  try { await loadExtras(); if (fxRendered) render(); } catch (e) { showLoadError(e); }
});
fxWrap('resetAll', async function(orig, args){
  await orig.apply(this, args);
  try { await loadExtras(); render(); } catch (e) {}
});
// لما نغيّر العميل / الصفحة، نصفّر خانات «تحصيل مع الفاتورة»
['openClient', 'goHome', 'goView'].forEach((n) => fxWrap(n, function(orig, args){ draftPay = ''; stagedPay = ''; return orig.apply(this, args); }));

/* ---------- الأرصدة (بعد خصم المرتجعات) ---------- */
function clientBalance(client){
  const inv = client.invoices.reduce((s, i) => s + i.total, 0);
  const pay = client.payments.reduce((s, p) => s + p.amount, 0);
  const ret = sumBy(clientReturnsOf(client.id), (r) => r.total);
  return Math.round((inv - pay - ret) * 100) / 100;
}
function supplierBalance(s){ // الموجب = احنا مديونين للمورد (بضاعة + سلف − اللي دفعناه − المرتجع له)
  const owedAdds = sumBy(s.txns.filter((t) => t.kind === 'goods' || t.kind === 'advance'), (t) => t.amount);
  const paid = sumBy(s.txns.filter((t) => t.kind === 'payment'), (t) => t.amount);
  const ret = sumBy(supplierReturnsOf(s.id), (r) => r.total);
  return r2(owedAdds - paid - ret);
}

/* ---------- المخزون: المرتجع من العميل بيرجّع الكمية، والمرتجع للمورد بيشيلها من الوارد ---------- */
fxWrap('monthStock', function(orig, args){
  if (!FXRET.clients.length && !FXRET.suppliers.length) return orig.apply(this, args);
  const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const sc = state.clients, ss = state.suppliers;
  try {
    state.clients = sc.map((c) => {
      const rs = clientReturnsOf(c.id); if (!rs.length) return c;
      return Object.assign({}, c, { invoices: c.invoices.concat(rs.map((r) => ({
        id: r.id, date: r.date, total: -r.total, discount: 0, rawText: '',
        items: (r.items || []).map((it) => ({ productId: it.productId, productName: it.productName, quantity: -n0(it.quantity), unitPrice: n0(it.unitPrice), subtotal: -n0(it.subtotal) })),
      }))) });
    });
    state.suppliers = ss.map((s) => {
      const rs = supplierReturnsOf(s.id); if (!rs.length) return s;
      return Object.assign({}, s, { txns: s.txns.concat(rs.map((r) => ({
        id: r.id, kind: 'goods', amount: -r.total, note: '', fromCash: false, date: r.date,
        items: (r.items || []).map((it) => { const p = it.productId ? productById(it.productId) : null;
          return { productId: it.productId, productName: it.productName, quantity: -n0(it.quantity), unitCost: n0(it.unitCost), sellPrice: p ? n0(p.price) : 0, subtotal: -n0(it.subtotal) }; }),
      }))) });
    });
    return orig.apply(this, args);
  } finally { state.clients = sc; state.suppliers = ss; }
});

/* ---------- ملخص الفترة (صافي بعد المرتجع) ---------- */
function rangeSummaryHtml(){
  const coll = sumBy(state.clients, (c) => sumBy(c.payments.filter((p) => inRange(p.date)), (p) => p.amount));
  const retC = sumBy(FXRET.clients.filter((r) => getClient(r.clientId) && inRange(r.date)), (r) => r.total);
  const sales = sumBy(state.clients, (c) => sumBy(c.invoices.filter((i) => inRange(i.date)), (i) => i.total)) - retC;
  const retS = sumBy(FXRET.suppliers.filter((r) => getSupplier(r.supplierId) && inRange(r.date)), (r) => r.total);
  const sup = sumBy(state.suppliers, (s) => sumBy(s.txns.filter((t) => t.kind === 'goods' && inRange(t.date)), (t) => t.amount)) - retS;
  const out = sumBy(cashMovements().filter((m) => m.dir === 'out' && inRange(m.date)), (m) => m.amount);
  return `<div class="card"><h2>ملخص: ${rangeLabel()}</h2>
    <div class="sum-grid">
      <div><div class="n" style="color:var(--credit)">${fmt(coll)}</div><div class="l">تحصيل</div></div>
      <div><div class="n" style="color:var(--debit)">${fmt(sales)}</div><div class="l">مبيعات${retC > 0 ? ' (بعد المرتجع)' : ''}</div></div>
      <div><div class="n">${fmt(sup)}</div><div class="l">بضاعة موردين${retS > 0 ? ' (بعد المرتجع)' : ''}</div></div>
      <div><div class="n" style="color:var(--debit)">${fmt(out)}</div><div class="l">خارج من الخزنة</div></div>
    </div></div>`;
}

/* =====================================================================
   محرر السطور (أصناف + كمية + سعر) — بيتستخدم لتعديل فاتورة المورد وللمرتجعات
   ===================================================================== */
let _le = null;
const _leBlank = () => ({ k: newId(), productId: '', productName: '', qty: '', price: '' });
const _leSub = (r) => { const q = num(r.qty), p = num(r.price); return (isNaN(q) || isNaN(p)) ? 0 : Math.round(q * p * 100) / 100; };

function openLinesEditor(cfg){
  _le = {
    cfg,
    rows: (cfg.rows && cfg.rows.length ? cfg.rows : [{}]).map((r) => Object.assign(_leBlank(), r)),
    day: cfg.day || localDateStr(new Date()),
    note: cfg.note || '',
    busy: false,
  };
  renderLinesEditor();
}
function _leTotals(){
  if (!_le) return;
  const el = document.getElementById('leTotal');
  if (el) el.textContent = 'الإجمالي: ' + fmt(r2(sumBy(_le.rows, _leSub))) + ' ج';
  _le.rows.forEach((r) => { const s = document.getElementById('leSub_' + r.k); if (s) s.textContent = fmt(_leSub(r)) + ' ج'; });
}
function leSet(k, field, v){ const r = _le && _le.rows.find((x) => x.k === k); if (r) { r[field] = v; _leTotals(); } }
function leSel(k, pid){
  const r = _le && _le.rows.find((x) => x.k === k); if (!r) return;
  if (pid) {
    const p = productById(pid); if (!p) return;
    r.productId = p.id; r.productName = p.name;
    const d = _le.cfg.defaultPrice ? _le.cfg.defaultPrice(p.id) : '';
    r.price = (d === '' || d == null) ? '' : String(d);
  }
  renderLinesEditor();
}
function leDel(k){ if (!_le) return; _le.rows = _le.rows.filter((x) => x.k !== k); if (!_le.rows.length) _le.rows.push(_leBlank()); renderLinesEditor(); }
function leAdd(){ if (!_le) return; _le.rows.push(_leBlank()); renderLinesEditor(); }
function renderLinesEditor(){
  closeEditModal();
  const ed = _le; if (!ed) return;
  const cfg = ed.cfg;
  const priceLabel = cfg.priceLabel || 'سعر الوحدة';
  const ov = document.createElement('div'); ov.className = 'modal-ov'; ov.id = 'editModal';
  const rowHtml = (r) => {
    const orphan = !r.productId && r.productName;
    return `<div class="ie-row">
      <select onchange="leSel('${r.k}', this.value)">
        ${orphan ? `<option value="" selected>${esc(r.productName)} (صنف محذوف)</option>` : (!r.productId ? '<option value="" selected>— اختار صنف —</option>' : '')}
        ${state.products.map((p) => `<option value="${p.id}" ${p.id === r.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="الكمية" value="${esc(r.qty)}" oninput="leSet('${r.k}','qty',this.value)">
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(priceLabel)}" value="${esc(r.price)}" oninput="leSet('${r.k}','price',this.value)">
      <div class="ie-sub" id="leSub_${r.k}">${fmt(_leSub(r))} ج</div>
      <button class="del-btn" onclick="leDel('${r.k}')" title="حذف الصنف">✕</button>
    </div>`;
  };
  ov.innerHTML = `<div class="modal wide">
    <h3>${esc(cfg.title)}</h3>
    ${cfg.hint ? `<div class="stage-note" style="margin:0 0 10px;">${esc(cfg.hint)}</div>` : ''}
    <div class="ie-head"><span>الصنف</span><span>الكمية</span><span>${esc(priceLabel)}</span><span>الإجمالي</span><span></span></div>
    ${ed.rows.map(rowHtml).join('')}
    <button class="btn btn-ghost" style="margin-top:8px;" onclick="leAdd()">+ إضافة صنف</button>
    <div class="modal-body" style="margin-top:12px;grid-template-columns:1fr 1fr;">
      <div><label>التاريخ</label><input type="date" value="${esc(ed.day)}" onchange="_le.day=this.value"></div>
      <div style="grid-column:1/-1;"><label>${esc(cfg.noteLabel || 'ملاحظة (اختياري)')}</label><textarea rows="2" oninput="_le.note=this.value">${esc(ed.note)}</textarea></div>
    </div>
    <div class="inv-sum stack" style="font-size:15px;font-weight:700;"><div id="leTotal"></div></div>
    <div class="modal-act"><button class="btn btn-ghost" onclick="closeEditModal()">إلغاء</button><button class="btn btn-cheese" onclick="leSave()">${esc(cfg.saveLabel || 'حفظ')}</button></div>
  </div>`;
  document.body.appendChild(ov);
  _leTotals();
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeEditModal(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditModal(); });
}
async function leSave(){
  const ed = _le; if (!ed || ed.busy) return;
  const items = [];
  for (const r of ed.rows) {
    const q = num(r.qty), p = num(r.price);
    if (!r.productId && !r.productName) { showToast('اختار الصنف في كل الصفوف'); return; }
    if (isNaN(q) || q <= 0) { showToast('اكتب الكمية في كل الصفوف'); return; }
    if (isNaN(p) || p < 0) { showToast('اكتب السعر في كل الصفوف'); return; }
    items.push({ productId: r.productId || null, productName: r.productName, quantity: q, unitPrice: p });
  }
  if (!(sumBy(items, (i) => i.quantity * i.unitPrice) > 0)) { showToast('الإجمالي لازم يكون أكبر من صفر'); return; }
  ed.busy = true;
  try { await ed.cfg.onSave({ items, day: ed.day, note: ed.note }); closeEditModal(); _le = null; }
  catch (e) { ed.busy = false; }
}
// بيحوّل سطور المحرر لشكل الـ API (unitPrice للعميل، unitCost للمورد)
const fxItems = (items, priceKey) => items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, [priceKey]: i.unitPrice }));

/* ---------- 1) تعديل فاتورة المورد كاملة ---------- */
function fxEditSupplierInvoice(s, t){
  openLinesEditor({
    title: 'تعديل فاتورة بضاعة — ' + s.name,
    hint: 'تقدر تغيّر الأصناف والكميات والأسعار والتاريخ. الإجمالي بيتحسب لوحده، وحساب المورد والمخزون بيتحدّثوا معاه.',
    rows: t.items.map((it) => ({ productId: it.productId || '', productName: it.productName, qty: String(it.quantity), price: String(it.unitCost) })),
    priceLabel: 'سعر الشراء', defaultPrice: (pid) => lastCostFor(pid),
    day: localDateStr(t.date), note: t.note || '', noteLabel: 'ملاحظة / رقم فاتورة المورد',
    onSave: async (v) => {
      const body = { items: fxItems(v.items, 'unitCost'), note: v.note };
      const dt = composeDate(v.day, t.date); if (dt) body.date = dt;
      const json = await apiFetch('supplier-txns/' + t.id, 'PUT', body);
      Object.assign(t, json.txn);
      render();
      showToast('اتعدّلت الفاتورة — إجماليها دلوقتي ' + fmt(t.amount) + ' ج');
    },
  });
}
fxWrap('editSupplierTxn', function(orig, args){
  const s = getSupplier(args[0]); const t = s && s.txns.find((x) => x.id === args[1]);
  if (t && t.kind === 'goods' && t.items && t.items.length) return fxEditSupplierInvoice(s, t);
  return orig.apply(this, args);
});

/* ---------- 2) مرتجع من العميل ---------- */
function addClientReturn(clientId){
  const c = getClient(clientId); if (!c) return;
  openLinesEditor({
    title: 'مرتجع من العميل — ' + c.name,
    hint: 'قيمة المرتجع بتتخصم من حساب العميل وبترجّع الكمية للمخزون — ومبيأثرش على الخزنة.',
    rows: [], priceLabel: 'سعر الوحدة', defaultPrice: (pid) => priceFor(pid),
    day: localDateStr(dateForNew()), note: '', noteLabel: 'ملاحظة (اختياري)', saveLabel: 'تسجيل المرتجع',
    onSave: async (v) => {
      const json = await apiFetch('clients/' + c.id + '/returns', 'POST', { items: fxItems(v.items, 'unitPrice'), note: v.note, date: fxDayIso(v.day) });
      FXRET.clients.push(json.ret);
      renderClientView();
      const b = clientBalance(c);
      showToast('اتسجّل المرتجع — ' + (b > 0.004 ? 'لسه عليه ' + fmt(b) + ' ج' : (b < -0.004 ? 'ليه رصيد ' + fmt(-b) + ' ج' : 'الحساب متزن')));
    },
  });
}
function editClientReturn(clientId, id){
  const c = getClient(clientId); const r = FXRET.clients.find((x) => x.id === id); if (!c || !r) return;
  openLinesEditor({
    title: 'تعديل مرتجع — ' + c.name,
    rows: (r.items || []).map((it) => ({ productId: it.productId || '', productName: it.productName, qty: String(it.quantity), price: String(it.unitPrice) })),
    priceLabel: 'سعر الوحدة', defaultPrice: (pid) => priceFor(pid),
    day: localDateStr(r.date), note: r.note || '',
    onSave: async (v) => {
      const body = { items: fxItems(v.items, 'unitPrice'), note: v.note };
      const dt = composeDate(v.day, r.date); if (dt) body.date = dt;
      const json = await apiFetch('client-returns/' + id, 'PUT', body);
      Object.assign(r, json.ret);
      renderClientView(); showToast('اتعدّل المرتجع');
    },
  });
}
async function deleteClientReturn(id){
  const snap = FXRET.clients.find((r) => r.id === id); if (!snap) return;
  try {
    await apiFetch('client-returns/' + id, 'DELETE');
    FXRET.clients = FXRET.clients.filter((r) => r.id !== id);
    renderClientView();
    offerUndo('اتمسح المرتجع', async () => {
      const json = await apiFetch('clients/' + snap.clientId + '/returns', 'POST', { items: snap.items, note: snap.note, date: snap.date });
      FXRET.clients.push(json.ret);
      renderClientView();
    });
  } catch (e) {}
}

/* ---------- 3) مرتجع للمورد ---------- */
function addSupplierReturn(supplierId){
  const s = getSupplier(supplierId); if (!s) return;
  openLinesEditor({
    title: 'مرتجع للمورد — ' + s.name,
    hint: 'قيمة المرتجع بتتخصم من اللي عليك للمورد وبتنقّص الوارد في المخزون — ومبيأثرش على الخزنة.',
    rows: [], priceLabel: 'سعر الشراء', defaultPrice: (pid) => lastCostFor(pid),
    day: localDateStr(dateForNew()), note: '', noteLabel: 'ملاحظة (اختياري)', saveLabel: 'تسجيل المرتجع',
    onSave: async (v) => {
      const json = await apiFetch('suppliers/' + s.id + '/returns', 'POST', { items: fxItems(v.items, 'unitCost'), note: v.note, date: fxDayIso(v.day) });
      FXRET.suppliers.push(json.ret);
      renderSupplierView();
      const b = supplierBalance(s);
      showToast('اتسجّل المرتجع — ' + (b > 0.004 ? 'لسه عليك ' + fmt(b) + ' ج' : (b < -0.004 ? 'ليك رصيد عنده ' + fmt(-b) + ' ج' : 'الحساب متزن')));
    },
  });
}
function editSupplierReturn(supplierId, id){
  const s = getSupplier(supplierId); const r = FXRET.suppliers.find((x) => x.id === id); if (!s || !r) return;
  openLinesEditor({
    title: 'تعديل مرتجع للمورد — ' + s.name,
    rows: (r.items || []).map((it) => ({ productId: it.productId || '', productName: it.productName, qty: String(it.quantity), price: String(it.unitCost) })),
    priceLabel: 'سعر الشراء', defaultPrice: (pid) => lastCostFor(pid),
    day: localDateStr(r.date), note: r.note || '',
    onSave: async (v) => {
      const body = { items: fxItems(v.items, 'unitCost'), note: v.note };
      const dt = composeDate(v.day, r.date); if (dt) body.date = dt;
      const json = await apiFetch('supplier-returns/' + id, 'PUT', body);
      Object.assign(r, json.ret);
      renderSupplierView(); showToast('اتعدّل المرتجع');
    },
  });
}
async function deleteSupplierReturn(id){
  const snap = FXRET.suppliers.find((r) => r.id === id); if (!snap) return;
  try {
    await apiFetch('supplier-returns/' + id, 'DELETE');
    FXRET.suppliers = FXRET.suppliers.filter((r) => r.id !== id);
    renderSupplierView();
    offerUndo('اتمسح المرتجع', async () => {
      const json = await apiFetch('suppliers/' + snap.supplierId + '/returns', 'POST', { items: snap.items, note: snap.note, date: snap.date });
      FXRET.suppliers.push(json.ret);
      renderSupplierView();
    });
  } catch (e) {}
}

/* ---------- عرض المرتجعات ---------- */
function fxRetTable(items, key){
  if (!items || !items.length) return '';
  return `<div class="tbl-wrap"><table>${items.map((it) => `<tr><td>${esc(it.productName)}</td><td>x${it.quantity}</td><td>${fmt(it[key])} ج</td><td>${fmt(it.subtotal)} ج</td></tr>`).join('')}</table></div>`;
}

// سجل العميل: فواتير + دفعات + مرتجعات
function renderHistory(){
  const area = document.getElementById('historyArea'); if (!area) return;
  const client = getClient(currentClientId); if (!client) return;
  const events = [
    ...client.invoices.map((i) => ({ date: i.date, kind: 'invoice', ref: i })),
    ...client.payments.map((p) => ({ date: p.date, kind: 'payment', ref: p })),
    ...clientReturnsOf(client.id).map((r) => ({ date: r.date, kind: 'return', ref: r })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!events.length) { area.innerHTML = '<div class="empty">لسه مفيش فواتير أو دفعات</div>'; return; }
  area.innerHTML = events.map((e) => {
    const dt = new Date(e.date);
    const dateStr = dt.toLocaleDateString('ar-EG') + ' ' + dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (e.kind === 'invoice') {
      return `<div class="invoice-card">
        <div class="invoice-head"><span class="tag item">فاتورة</span><span class="dt">${dateStr}</span></div>
        <table>${e.ref.items.map((it) => `<tr><td>${esc(it.productName)}</td><td>x${it.quantity}</td><td>${fmt(it.unitPrice)} ج</td><td>${fmt(it.subtotal)} ج</td></tr>`).join('')}</table>
        <div class="invoice-head" style="margin-top:6px;margin-bottom:0;">
          <div class="inv-lines">
            ${e.ref.discount > 0 ? `<div class="muted">إجمالي الأصناف: ${fmt(e.ref.total + e.ref.discount)} ج</div><div class="muted">خصم: − ${fmt(e.ref.discount)} ج</div>` : ''}
            <div class="invoice-total">${e.ref.discount > 0 ? 'الصافي' : 'الإجمالي'}: ${fmt(e.ref.total)} ج</div>
          </div>
          <span><button class="edit-btn" onclick="editInvoice('${client.id}','${e.ref.id}')">تعديل الفاتورة ✎</button>
          <button class="del-btn" onclick="deleteInvoice('${e.ref.id}')">حذف الفاتورة ✕</button></span>
        </div>
      </div>`;
    }
    if (e.kind === 'return') {
      return `<div class="invoice-card ret-card">
        <div class="invoice-head"><span class="tag ret">مرتجع</span><span class="dt">${dateStr}</span></div>
        ${fxRetTable(e.ref.items, 'unitPrice')}
        ${e.ref.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(e.ref.note)}</div>` : ''}
        <div class="invoice-head" style="margin-top:6px;margin-bottom:0;">
          <div class="inv-lines"><div class="invoice-total" style="color:var(--credit);">قيمة المرتجع: − ${fmt(e.ref.total)} ج</div>
            <div class="muted">بيتخصم من الحساب — ومبيأثرش على الخزنة</div></div>
          <span><button class="edit-btn" onclick="editClientReturn('${client.id}','${e.ref.id}')">تعديل ✎</button>
          <button class="del-btn" onclick="deleteClientReturn('${e.ref.id}')">حذف ✕</button></span>
        </div>
      </div>`;
    }
    return `<div class="payment-line">
      <div><span class="tag payment">دفعة</span>
        ${e.ref.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(e.ref.note)}</div>` : ''}</div>
      <div class="pl-side"><div class="pl-date">${dateStr}</div><div class="pl-act">
        <span class="amt-minus">- ${fmt(e.ref.amount)} ج</span>
        <button class="edit-btn" onclick="editClientPayment('${client.id}','${e.ref.id}')" title="تعديل">✎</button>
        <button class="del-btn" onclick="deletePayment('${e.ref.id}')">✕</button>
      </div></div>
    </div>`;
  }).join('');
}

// سجل المورد: بضاعة + سلف + دفعات + مرتجعات
function fxSupAdvanceLine(s, t){
  return `
      <div class="payment-line" style="background:#FBF3EF;">
        <div><span class="tag item">سلفة</span> ${t.fromCash ? '<span class="chip" style="padding:1px 8px;font-size:11px;">اتضافت على الخزنة</span>' : '<span class="chip" style="padding:1px 8px;font-size:11px;">من غير الخزنة</span>'}
          ${t.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.note)}</div>` : ''}</div>
        <div class="pl-side"><div class="pl-date">${fmtDateTime(t.date)}</div><div class="pl-act"><span class="amt-plus">+ ${fmt(t.amount)} ج</span>
          <button class="edit-btn" onclick="editSupplierTxn('${s.id}','${t.id}')" title="تعديل">✎</button>
          <button class="del-btn" onclick="deleteSupplierTxn('${s.id}','${t.id}')">✕</button></div></div>
      </div>`;
}
function fxSupPaymentLine(s, t){
  return `
      <div class="payment-line">
        <div><span class="tag payment">دفعة</span>${t.appliesTo === 'advance' ? ' <span class="chip" style="padding:1px 8px;font-size:11px;">سداد سلفة</span>' : ''}
          <div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.note)}${t.fromCash ? '' : ' (من برّه الخزنة)'}</div></div>
        <div class="pl-side"><div class="pl-date">${fmtDateTime(t.date)}</div><div class="pl-act"><span class="amt-minus">- ${fmt(t.amount)} ج</span>
          <button class="edit-btn" onclick="editSupplierTxn('${s.id}','${t.id}')" title="تعديل">✎</button>
          <button class="del-btn" onclick="deleteSupplierTxn('${s.id}','${t.id}')">✕</button></div></div>
      </div>`;
}
function fxSupReturnCard(s, r){
  return `<div class="invoice-card ret-card">
    <div class="invoice-head"><span class="tag ret">مرتجع للمورد</span><span class="dt">${fmtDateTime(r.date)}</span></div>
    ${fxRetTable(r.items, 'unitCost')}
    ${r.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(r.note)}</div>` : ''}
    <div class="inv-sum"><span>قيمة المرتجع: <b style="color:var(--credit)">− ${fmt(r.total)} ج</b> <span class="muted">(بيتخصم من حساب المورد — ومبيأثرش على الخزنة)</span></span></div>
    <div style="text-align:left;margin-top:4px;"><button class="edit-btn" onclick="editSupplierReturn('${s.id}','${r.id}')">تعديل ✎</button> <button class="del-btn" onclick="deleteSupplierReturn('${r.id}')">حذف ✕</button></div>
  </div>`;
}
function renderSupplierHistory(){
  const box = document.getElementById('supHistory'); if (!box) return;
  const s = getSupplier(currentSupplierId); if (!s) return;
  updateSupplierStats();
  const ev = s.txns.filter((t) => inRange(t.date)).map((t) => ({ d: t.date, t }))
    .concat(supplierReturnsOf(s.id).filter((r) => inRange(r.date)).map((r) => ({ d: r.date, r })))
    .sort((a, b) => new Date(b.d) - new Date(a.d));
  box.innerHTML = `
    <div class="stage-note" style="margin:0 0 10px;">المعروض: <b>${rangeLabel()}</b> —
      <a class="lnk" onclick="shiftWeek(-7)">→ ٧ أيام أقدم</a> • <a class="lnk" onclick="shiftWeek(7)">٧ أيام أحدث ←</a></div>
    ${ev.length ? ev.map((e) => e.r ? fxSupReturnCard(s, e.r)
      : (e.t.kind === 'goods' ? supInvoiceCard(s, e.t, false) : (e.t.kind === 'advance' ? fxSupAdvanceLine(s, e.t) : fxSupPaymentLine(s, e.t)))).join('')
      : '<div class="empty">مفيش حاجة في الفترة دي</div>'}`;
}
fxWrap('updateSupplierStats', function(orig, args){
  orig.apply(this, args);
  const el = document.getElementById('supStats'); const s = getSupplier(currentSupplierId); if (!el || !s) return;
  const v = sumBy(supplierReturnsOf(s.id).filter((r) => inRange(r.date)), (r) => r.total);
  if (v > 0) el.insertAdjacentHTML('beforeend', `<div><div class="n" style="color:var(--credit)">${fmt(v)}</div><div class="l">مرتجع للمورد — ${rangeLabel()}</div></div>`);
});

/* ---------- 4) صفحة العميل: اختيار عميل تاني + أزرار سريعة (تحصيل / مرتجع) ---------- */
function fxClientSelect(client){
  const list = state.clients.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  return `<div class="fx-client-row"><label>👤 افتح حساب عميل تاني:</label>
    <select class="fx-client-pick" onchange="if(this.value)openClient(this.value)" title="افتح حساب عميل تاني">
    ${list.map((c) => { const b = clientBalance(c);
      return `<option value="${c.id}" ${c.id === client.id ? 'selected' : ''}>${esc(c.name)} — ${fmt(Math.abs(b))} ج${b > 0.004 ? ' عليه' : (b < -0.004 ? ' له' : '')}</option>`; }).join('')}
  </select></div>`;
}
function fxEnhanceClientView(){
  const client = getClient(currentClientId); const app = document.getElementById('app');
  if (!client || !app || !app.querySelector('.back-btn')) return;
  const strip = document.getElementById('dateStrip');
  if (strip && !app.querySelector('.fx-client-row')) strip.insertAdjacentHTML('afterend', fxClientSelect(client));
  const rec = app.querySelector('.receipt');
  const rets = clientReturnsOf(client.id);
  const ms = rec && rec.querySelector('.mini-stats');
  if (ms && rets.length) ms.insertAdjacentHTML('beforeend', `<div><div class="n" style="color:var(--credit)">${fmt(retSum(rets))}</div><div class="l">إجمالي المرتجع</div></div>`);
  if (rec) rec.insertAdjacentHTML('afterend', `<div class="qa-bar">
    <button class="btn btn-credit" onclick="fxQuickCollect()">💵 تحصيل (من غير فاتورة)</button>
    <button class="btn btn-outline" onclick="addClientReturn(currentClientId)">↩️ مرتجع من العميل</button></div>`);
  // شيل كارت «فاتورة جديدة من رسايل واتساب» وكارت «تسجيل دفعة» — التحصيل من غير فاتورة بقى من الزرار اللي فوق
  app.querySelectorAll('.card h2').forEach((h) => {
    const t = h.textContent.trim();
    if (t.indexOf('فاتورة جديدة من رسايل واتساب') === 0 || t.indexOf('تسجيل دفعة') === 0) { const card = h.closest('.card'); if (card) card.remove(); }
  });
}
fxWrap('renderClientView', function(orig, args){ orig.apply(this, args); fxEnhanceClientView(); });

function fxEnhanceSupplierView(){
  const s = getSupplier(currentSupplierId); const app = document.getElementById('app');
  if (!s || !app) return;
  const rec = app.querySelector('.receipt');
  if (rec) rec.insertAdjacentHTML('afterend', `<div class="qa-bar"><button class="btn btn-outline" onclick="addSupplierReturn(currentSupplierId)">↩️ مرتجع للمورد</button></div>`);
}
fxWrap('renderSupplierView', function(orig, args){ orig.apply(this, args); fxEnhanceSupplierView(); });

function fxQuickCollect(){
  const c = getClient(currentClientId); if (!c) return;
  const bal = clientBalance(c);
  openEditModal({
    title: 'تحصيل من ' + c.name,
    fields: [
      { key: 'info', type: 'info', value: bal > 0.004 ? 'المطلوب من العميل دلوقتي: ' + fmt(bal) + ' ج' : 'مفيش مطلوب على العميل دلوقتي' },
      { key: 'amount', label: 'المبلغ اللي استلمته', type: 'num', value: bal > 0.004 ? bal : '' },
      { key: 'note', label: 'ملاحظة (اختياري)', type: 'text', value: '' },
      { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(dateForNew()) },
    ],
    onSave: async (v) => {
      if (!(v.amount > 0)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
      const json = await apiFetch('clients/' + c.id + '/payments', 'POST', { amount: v.amount, note: v.note, date: fxDayIso(v.day) });
      c.payments.push(json.payment);
      renderClientView();
      showToast('اتسجّل التحصيل');
    },
  });
}

/* ---------- 5) تحصيل مع الفاتورة (واتساب + يدوي) ---------- */
function fxPayAmount(v){ const x = num(v); return isNaN(x) || x < 0 ? 0 : Math.round(x * 100) / 100; }
function fxPayNote(kind){
  const el = document.getElementById('fxPayNote_' + kind); if (!el) return;
  const g = kind === 'draft' ? draftGross() : stagedGross();
  const disc = Math.min(discNum(kind === 'draft' ? draftDisc : stagedDisc), g);
  const net = r2(g - disc);
  const pay = fxPayAmount(kind === 'draft' ? draftPay : stagedPay);
  if (!(pay > 0)) { el.textContent = ''; return; }
  const left = r2(net - pay);
  el.textContent = left > 0.004 ? 'الصافي ' + fmt(net) + ' ج — هيفضل على العميل من الفاتورة دي: ' + fmt(left) + ' ج'
    : (left < -0.004 ? 'التحصيل أكبر من الفاتورة بـ ' + fmt(-left) + ' ج — هيتحسب رصيد للعميل' : 'الفاتورة هتتسدّد بالكامل ✓');
}
function fxSetPay(kind, v){ if (kind === 'draft') draftPay = v; else stagedPay = v; fxPayNote(kind); }
function fxPayField(kind){
  const area = document.getElementById(kind === 'draft' ? 'draftList' : 'stagedArea'); if (!area) return;
  const act = area.querySelector('.row-actions'); if (!act || area.querySelector('.fx-pay')) return;
  const val = kind === 'draft' ? draftPay : stagedPay;
  act.insertAdjacentHTML('beforebegin', `<div class="f-grid fx-pay"><div><label>💵 تحصيل مع الفاتورة (اختياري)</label>
    <input type="text" inputmode="decimal" autocomplete="off" placeholder="المبلغ اللي العميل دفعه دلوقتي" value="${esc(val)}" oninput="fxSetPay('${kind}',this.value)"></div></div>
    <div class="stage-note fx-pay-note" id="fxPayNote_${kind}"></div>`);
  fxPayNote(kind);
}
fxWrap('renderDraft', function(orig, args){ orig.apply(this, args); fxPayField('draft'); });
fxWrap('renderStaged', function(orig, args){ orig.apply(this, args); fxPayField('staged'); });
fxWrap('updateDraftNet', function(orig, args){ orig.apply(this, args); fxPayNote('draft'); });
fxWrap('updateStagedNet', function(orig, args){ orig.apply(this, args); fxPayNote('staged'); });
fxWrap('discardStaged', function(orig, args){ stagedPay = ''; return orig.apply(this, args); });

async function fxPostPayment(client, amount){
  const pj = await apiFetch('clients/' + client.id + '/payments', 'POST', { amount, note: 'تحصيل مع الفاتورة', date: dateForNew() });
  client.payments.push(pj.payment);
}
async function saveDraftInvoice(){
  if (!draftItems.length) { showToast('ضيف صنف الأول'); return; }
  const client = getClient(currentClientId); if (!client) return;
  const extra = fxPayAmount(draftPay);
  try {
    const invItems = draftItems.map((d) => ({ productId: d.productId, quantity: d.quantity, unitPrice: d.unitPrice }));
    const disc = discNum(draftDisc);
    if (disc > draftGross() + 0.001) { showToast('الخصم أكبر من إجمالي الفاتورة'); return; }
    const json = await apiFetch('clients/' + client.id + '/invoices', 'POST', { items: invItems, rawText: 'إضافة يدوية', date: dateForNew(), discount: disc });
    client.invoices.push(json.invoice);
  } catch (e) { return; }
  draftItems = []; draftDisc = ''; draftPay = '';
  if (extra > 0) {
    try { await fxPostPayment(client, extra); }
    catch (e) { renderClientView(); showToast('اتحفظت الفاتورة بس التحصيل فشل — سجّله من زرار «تحصيل»'); return; }
  }
  renderClientView();
  showToast(extra > 0 ? 'اتحفظت الفاتورة واتسجّل التحصيل' : 'اتحفظت الفاتورة');
}
async function confirmStaged(){
  const client = getClient(currentClientId); if (!client) return;
  const items = staged.filter((s) => s.type === 'item' && s.productId);
  const payments = staged.filter((s) => s.type === 'payment');
  if (!items.length && !payments.length) { showToast('مفيش عناصر جاهزة للإضافة'); return; }
  const extra = items.length ? fxPayAmount(stagedPay) : 0;
  try {
    if (items.length) {
      const invItems = items.map((s) => ({ productId: s.productId, quantity: s.quantity, unitPrice: s.unitPrice }));
      const rawText = items.map((s) => s.note).join('\n');
      const disc = discNum(stagedDisc);
      if (disc > stagedGross() + 0.001) { showToast('الخصم أكبر من إجمالي الأصناف'); return; }
      const json = await apiFetch('clients/' + client.id + '/invoices', 'POST', { items: invItems, rawText, date: dateForNew(), discount: disc });
      client.invoices.push(json.invoice);
    }
    for (const p of payments) {
      const json = await apiFetch('clients/' + client.id + '/payments', 'POST', { amount: p.amount, note: p.note, date: dateForNew() });
      client.payments.push(json.payment);
    }
  } catch (e) { return; }
  staged = []; stagedDisc = ''; stagedPay = '';
  const pa = document.getElementById('pasteArea'); if (pa) pa.value = '';
  if (extra > 0) {
    try { await fxPostPayment(client, extra); }
    catch (e) { renderClientView(); showToast('اتحفظت الفاتورة بس التحصيل فشل — سجّله من زرار «تحصيل»'); return; }
  }
  renderClientView();
  showToast(extra > 0 ? 'تم تسجيل الفاتورة والتحصيل' : 'تم تسجيل العملية');
}

/* =====================================================================
   الإكسيل: كشف الحساب بيشمل المرتجعات (الرصيد المتحرك يطلع نفس الرصيد على الشاشة)
   ===================================================================== */
const _retText = (r, key) => (r.items || []).map((it) => `${it.productName}  ×${_en(it.quantity)}  @ ${_en(it[key])}  =  ${_en(it.subtotal)}`).join('\n') + (r.note ? `\nملاحظة: ${r.note}` : '');

function _clientEvents(c){
  return [
    ...c.invoices.map((i) => ({ d: i.date, t: 'فاتورة', ref: i })),
    ...c.payments.map((p) => ({ d: p.date, t: 'دفعة', ref: p })),
    ...clientReturnsOf(c.id).map((r) => ({ d: r.date, t: 'مرتجع', ref: r })),
  ].sort(_asc);
}
function _supBalMap(s){
  let run = 0; const m = {};
  s.txns.map((t) => ({ d: t.date, id: t.id, v: t.kind === 'payment' ? -t.amount : t.amount }))
    .concat(supplierReturnsOf(s.id).map((r) => ({ d: r.date, id: r.id, v: -r.total })))
    .sort((a, b) => new Date(a.d) - new Date(b.d))
    .forEach((e) => { run += e.v; m[e.id] = r2(run); });
  return m;
}
function _clientStatement(wb, c, f, all, sheetName){
  let run = 0, opening = null; const per = [];
  _clientEvents(c).forEach((e) => {
    const before = run;
    run += e.t === 'فاتورة' ? e.ref.total : -e.ref.amount;
    if (f(e.d)) { if (opening === null) opening = before; per.push({ e, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, kind: 'رصيد سابق', desc: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  per.forEach((x, i) => {
    const inv = x.e.t === 'فاتورة', ret = x.e.t === 'مرتجع';
    rows.push({ n: i + 1, date: x.e.d, kind: x.e.t,
      desc: inv ? _invText(x.e.ref) : (ret ? _retText(x.e.ref, 'unitPrice') : (x.e.ref.note ? 'دفعة — ' + x.e.ref.note : 'دفعة نقدية')),
      debit: inv ? x.e.ref.total : null, credit: inv ? null : x.e.ref.amount, bal: x.bal });
  });
  const inV = per.filter((x) => x.e.t === 'فاتورة'), pyV = per.filter((x) => x.e.t === 'دفعة'), rtV = per.filter((x) => x.e.t === 'مرتجع');
  const bal = clientBalance(c);
  xlTable(wb, sheetName || 'كشف الحساب', {
    title: 'كشف حساب العميل: ' + c.name, subtitle: _sub(all),
    stats: [
      { label: 'إجمالي الفواتير', value: r2(sumBy(inV, (x) => x.e.ref.total)), color: XL.debit },
      { label: 'إجمالي المدفوع', value: r2(sumBy(pyV, (x) => x.e.ref.amount)), color: XL.credit },
      { label: 'إجمالي المرتجع', value: r2(sumBy(rtV, (x) => x.e.ref.amount)), color: XL.credit },
      { label: bal > 0 ? 'المتبقي على العميل (الرصيد الحالي)' : 'الرصيد الحالي', value: bal, color: _col(bal > 0.004) },
    ],
    cols: [
      { h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'النوع', k: 'kind', w: 12 },
      { h: 'البيان / تفاصيل الفاتورة', k: 'desc', w: 52, wrap: true },
      { h: 'قيمة الفاتورة', k: 'debit', w: 16, t: 'money', color: 'debit' },
      { h: 'الدفعة / المرتجع (بيتخصم)', k: 'credit', w: 19, t: 'money', color: 'credit' },
      { h: 'الرصيد المتبقي', k: 'bal', w: 18, t: 'money' },
    ],
    rows, balance: { key: 'bal', plus: 'debit', minus: 'credit' },
    total: { label: 'الإجمالي', labelKey: 'desc', sums: ['debit', 'credit'], balKey: true },
  });
}
function _supStatement(wb, s, f, all, sheetName){
  const ev = s.txns.map((t) => ({ d: t.date, t })).concat(supplierReturnsOf(s.id).map((r) => ({ d: r.date, r })))
    .sort((a, b) => new Date(a.d) - new Date(b.d));
  let run = 0, opening = null; const per = [];
  ev.forEach((e) => {
    const before = run;
    run += e.r ? -e.r.total : (e.t.kind === 'payment' ? -e.t.amount : e.t.amount);
    if (f(e.d)) { if (opening === null) opening = before; per.push({ e, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, kind: 'رصيد سابق', desc: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  per.forEach((x, i) => {
    const R = x.e.r, t = x.e.t;
    rows.push({ n: i + 1, date: x.e.d,
      kind: R ? 'مرتجع' : (t.kind === 'goods' ? 'بضاعة' : (t.kind === 'advance' ? 'سلفة' : 'دفعة')),
      desc: R ? _retText(R, 'unitCost') : _supText(t),
      debit: R ? null : (t.kind === 'payment' ? null : t.amount),
      credit: R ? R.total : (t.kind === 'payment' ? t.amount : null), bal: x.bal });
  });
  const goods = per.filter((x) => x.e.t && x.e.t.kind === 'goods').map((x) => x.e.t);
  const adv = per.filter((x) => x.e.t && x.e.t.kind === 'advance').map((x) => x.e.t);
  const paid = per.filter((x) => x.e.t && x.e.t.kind === 'payment').map((x) => x.e.t);
  const rets = per.filter((x) => x.e.r).map((x) => x.e.r);
  const bal = supplierBalance(s);
  xlTable(wb, sheetName || 'كشف الحساب', {
    title: 'كشف حساب المورد: ' + s.name, subtitle: _sub(all),
    stats: [
      { label: 'إجمالي البضاعة', value: r2(sumBy(goods, (t) => t.amount)), color: XL.debit },
      { label: 'سلف استلمتها', value: r2(sumBy(adv, (t) => t.amount)), color: XL.debit },
      { label: 'إجمالي المدفوع', value: r2(sumBy(paid, (t) => t.amount)), color: XL.credit },
      { label: 'مرتجع للمورد', value: r2(sumBy(rets, (r) => r.total)), color: XL.credit },
      { label: bal > 0 ? 'المتبقي للمورد' : 'الرصيد الحالي', value: bal, color: _col(bal > 0.004) },
    ],
    cols: [
      { h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'النوع', k: 'kind', w: 12 },
      { h: 'البيان / تفاصيل الفاتورة', k: 'desc', w: 52, wrap: true },
      { h: 'قيمة البضاعة / السلفة', k: 'debit', w: 20, t: 'money', color: 'debit' },
      { h: 'المدفوع / المرتجع (بيتخصم)', k: 'credit', w: 22, t: 'money', color: 'credit' },
      { h: 'المتبقي للمورد', k: 'bal', w: 18, t: 'money' },
    ],
    rows, balance: { key: 'bal', plus: 'debit', minus: 'credit' },
    total: { label: 'الإجمالي', labelKey: 'desc', sums: ['debit', 'credit'], balKey: true },
  });
}


/* ---------- 6) كروت بتتفتح وتتقفل بسهم (الاختيار بيتحفظ على الجهاز) ---------- */
let FXCOLL = {};
try { FXCOLL = JSON.parse(localStorage.getItem('fx_coll') || '{}') || {}; } catch (e) { FXCOLL = {}; }
function fxSaveColl(){ try { localStorage.setItem('fx_coll', JSON.stringify(FXCOLL)); } catch (e) {} }
function fxCollapsed(key, dflt){ return Object.prototype.hasOwnProperty.call(FXCOLL, key) ? !!FXCOLL[key] : !!dflt; }
function fxApplyColl(card, collapsed){
  const head = card.firstElementChild; if (!head) return;
  Array.from(card.children).forEach((ch) => { if (ch !== head) ch.style.display = collapsed ? 'none' : ''; });
  const arrow = card.querySelector('.fx-arrow'); if (arrow) arrow.textContent = collapsed ? '◀' : '▼';
}
function fxMakeCollapsible(card, key, dflt){
  if (!card || card.dataset.fxColl) return;
  const head = card.firstElementChild; if (!head) return;
  const h2 = head.tagName === 'H2' ? head : head.querySelector('h2'); if (!h2) return;
  card.dataset.fxColl = key;
  h2.insertAdjacentHTML('afterbegin', '<span class="fx-arrow"></span>');
  head.classList.add('fx-collhead');
  head.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, label, [contenteditable]')) return;
    const now = !fxCollapsed(key, dflt);
    FXCOLL[key] = now; fxSaveColl(); fxApplyColl(card, now);
  });
  fxApplyColl(card, fxCollapsed(key, dflt));
}
function fxCardByTitle(title){
  const hs = document.querySelectorAll('#app .card h2');
  for (const h of hs) { if (h.textContent.replace(/^[▼◀]\s*/, '').trim() === title) return h.closest('.card'); }
  return null;
}
fxWrap('renderHome', function(orig, args){
  orig.apply(this, args);
  fxMakeCollapsible(fxCardByTitle('الأصناف والأسعار'), 'home_products', true);   // مقفول من الأول
  fxMakeCollapsible(fxCardByTitle('العملاء'), 'home_clients', false);             // مفتوح من الأول
});
fxWrap('renderSupMove', function(orig, args){
  orig.apply(this, args);
  fxMakeCollapsible(fxCardByTitle('تسجيل حركة مع المورد'), 'sup_move', true);     // مقفول من الأول
});

/* ---------- تشغيل: تحميل المرتجعات أول ما الصفحة تفتح ---------- */
loadExtras().then(() => { if (fxRendered) render(); }).catch((e) => { showLoadError(e); });
