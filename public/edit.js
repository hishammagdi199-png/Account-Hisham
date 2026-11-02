/* ===== edit.js: تعديل البيان والمبلغ والتاريخ من غير حذف وإعادة كتابة ===== */
const _badAmount = (v) => !(v > 0);

function editCashEntry(id){
  const e = state.cash.find(x => x.id === id); if (!e) return;
  openEditModal({ title: 'تعديل حركة الخزنة', fields: [
    { key: 'type', label: 'النوع', type: 'select', value: e.type, options: [{ v: 'out', l: 'صرف (خارج)' }, { v: 'in', l: 'إيداع (داخل)' }] },
    { key: 'amount', label: 'المبلغ', type: 'num', value: e.amount },
    { key: 'payee', label: 'صرفتها فين / لمين (أو جت من مين)', type: 'text', value: e.payee },
    { key: 'reason', label: 'البيان / السبب', type: 'area', value: e.reason },
    { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(e.date) },
  ], onSave: async (v) => {
    if (_badAmount(v.amount)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
    const body = { type: v.type, amount: v.amount, payee: v.payee, reason: v.reason };
    const dt = composeDate(v.day, e.date); if (dt) body.date = dt;
    const json = await apiFetch('cash/' + id, 'PUT', body);
    Object.assign(e, json.entry); render(); showToast('اتعدّلت الحركة');
  } });
}

function editPersonalEntry(id){
  const e = state.personal.find(x => x.id === id); if (!e) return;
  const fields = e.loan ? [
    { key: 'amount', label: 'المبلغ', type: 'num', value: e.amount },
    { key: 'party', label: e.loan === 'borrow' ? 'استلفت من مين' : 'سدّدت لمين', type: 'text', value: e.party },
    { key: 'note', label: 'ملاحظات', type: 'area', value: e.note },
    { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(e.date) },
  ].concat(e.loan === 'repay' ? [{ key: 'fromAcct', label: 'تتخصم من رصيد حسابي', type: 'check', value: !e.offAccount }] : []) : [
    { key: 'type', label: 'النوع', type: 'select', value: e.type, options: [{ v: 'out', l: 'مصروف' }, { v: 'in', l: 'إيداع' }] },
    { key: 'amount', label: 'المبلغ', type: 'num', value: e.amount },
    { key: 'party', label: 'الجهة (فين / لمين / منين)', type: 'text', value: e.party },
    { key: 'category', label: 'التصنيف', type: 'text', value: e.category },
    { key: 'note', label: 'ملاحظات', type: 'area', value: e.note },
    { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(e.date) },
  ];
  openEditModal({ title: e.loan ? (e.loan === 'borrow' ? 'تعديل سلفة' : 'تعديل سداد سلفة') : 'تعديل حركة في حسابي', fields, onSave: async (v) => {
    if (_badAmount(v.amount)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
    const body = e.loan ? { amount: v.amount, party: v.party, note: v.note } : { type: v.type, amount: v.amount, party: v.party, category: v.category, note: v.note };
    if (e.loan === 'repay') body.offAccount = !v.fromAcct;
    const dt = composeDate(v.day, e.date); if (dt) body.date = dt;
    const json = await apiFetch('personal/' + id, 'PUT', body);
    Object.assign(e, json.entry); render(); showToast('اتعدّلت الحركة');
  } });
}

function editClientPayment(clientId, payId){
  const c = getClient(clientId); const p = c && c.payments.find(x => x.id === payId); if (!p) return;
  openEditModal({ title: 'تعديل دفعة — ' + c.name, fields: [
    { key: 'amount', label: 'المبلغ', type: 'num', value: p.amount },
    { key: 'note', label: 'الملاحظة / البيان', type: 'area', value: p.note },
    { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(p.date) },
  ], onSave: async (v) => {
    if (_badAmount(v.amount)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
    const body = { amount: v.amount, note: v.note };
    const dt = composeDate(v.day, p.date); if (dt) body.date = dt;
    const json = await apiFetch('payments/' + payId, 'PUT', body);
    Object.assign(p, json.payment); render(); showToast('اتعدّلت الدفعة');
  } });
}

function editSupplierTxn(supplierId, txnId){
  const s = getSupplier(supplierId); const t = s && s.txns.find(x => x.id === txnId); if (!t) return;
  const hasItems = t.kind === 'goods' && t.items && t.items.length;
  const fields = [];
  if (hasItems) fields.push({ key: 'info', type: 'info', value: 'إجمالي الفاتورة ' + fmt(t.amount) + ' ج — الأصناف والأسعار ما تتعدّلش من هنا (احذف الفاتورة وأضفها من جديد لو عايز تغيّرها).' });
  else fields.push({ key: 'amount', label: 'المبلغ', type: 'num', value: t.amount });
  fields.push({ key: 'note', label: 'الملاحظة / البيان', type: 'area', value: t.note });
  if (t.kind === 'payment') fields.push({ key: 'fromCash', label: 'تتخصم من الخزنة', type: 'check', value: t.fromCash });
  fields.push({ key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(t.date) });
  openEditModal({ title: (t.kind === 'goods' ? 'تعديل فاتورة بضاعة — ' : 'تعديل دفعة — ') + s.name, fields, onSave: async (v) => {
    const body = { note: v.note };
    if (!hasItems) { if (_badAmount(v.amount)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); } body.amount = v.amount; }
    if (t.kind === 'payment') body.fromCash = v.fromCash;
    const dt = composeDate(v.day, t.date); if (dt) body.date = dt;
    const json = await apiFetch('supplier-txns/' + txnId, 'PUT', body);
    Object.assign(t, json.txn); render(); showToast('اتعدّلت العملية');
  } });
}


/* ===== تعديل فاتورة عميل: الأصناف (صنف / كمية / سعر) + التاريخ ===== */
let _invEd = null;
function editInvoice(clientId, invoiceId){
  const c = getClient(clientId); const inv = c && c.invoices.find(i => i.id === invoiceId); if (!inv) return;
  _invEd = { clientId, invoiceId, day: localDateStr(inv.date),
    rows: inv.items.map(it => ({ k: newId(), productId: it.productId || '', productName: it.productName, qty: String(it.quantity), price: String(it.unitPrice) })) };
  renderInvEditor();
}
const _ieSub = (r) => { const q = num(r.qty), p = num(r.price); return (isNaN(q) || isNaN(p)) ? 0 : Math.round(q * p * 100) / 100; };
function _ieTotals(){
  const t = r2(sumBy(_invEd.rows, _ieSub));
  const el = document.getElementById('ieTotal'); if (el) el.textContent = fmt(t) + ' ج';
  _invEd.rows.forEach(r => { const s = document.getElementById('ieSub_' + r.k); if (s) s.textContent = fmt(_ieSub(r)) + ' ج'; });
}
function invEdSet(k, field, v){ const r = _invEd.rows.find(x => x.k === k); if (r) { r[field] = v; _ieTotals(); } }
function invEdSel(k, pid){
  const r = _invEd.rows.find(x => x.k === k); if (!r) return;
  if (pid) { const p = state.products.find(x => x.id === pid); r.productId = p.id; r.productName = p.name; r.price = String(priceFor(p.id)); }
  renderInvEditor();
}
function invEdDel(k){ _invEd.rows = _invEd.rows.filter(x => x.k !== k); renderInvEditor(); }
function invEdAdd(){ _invEd.rows.push({ k: newId(), productId: '', productName: '', qty: '', price: '' }); renderInvEditor(); }
function renderInvEditor(){
  closeEditModal();
  const ed = _invEd; if (!ed) return;
  const c = getClient(ed.clientId);
  const ov = document.createElement('div'); ov.className = 'modal-ov'; ov.id = 'editModal';
  const rowHtml = (r) => {
    const orphan = !r.productId && r.productName;
    return `<div class="ie-row">
      <select onchange="invEdSel('${r.k}', this.value)">
        ${orphan ? `<option value="" selected>${esc(r.productName)} (صنف محذوف)</option>` : (!r.productId ? '<option value="" selected>— اختار صنف —</option>' : '')}
        ${state.products.map(p => `<option value="${p.id}" ${p.id === r.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="الكمية" value="${esc(r.qty)}" oninput="invEdSet('${r.k}','qty',this.value)">
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="سعر الوحدة" value="${esc(r.price)}" oninput="invEdSet('${r.k}','price',this.value)">
      <div class="ie-sub" id="ieSub_${r.k}">${fmt(_ieSub(r))} ج</div>
      <button class="del-btn" onclick="invEdDel('${r.k}')" title="حذف الصنف">✕</button>
    </div>`;
  };
  ov.innerHTML = `<div class="modal wide">
    <h3>تعديل فاتورة — ${esc(c ? c.name : '')}</h3>
    <div class="ie-head"><span>الصنف</span><span>الكمية</span><span>سعر الوحدة</span><span>الإجمالي</span><span></span></div>
    ${ed.rows.map(rowHtml).join('')}
    <button class="btn btn-ghost" style="margin-top:8px;" onclick="invEdAdd()">+ إضافة صنف</button>
    <div class="modal-body" style="margin-top:12px;"><div><label>تاريخ الفاتورة</label><input type="date" id="ieDay" value="${esc(ed.day)}" onchange="_invEd.day=this.value"></div></div>
    <div class="inv-sum" style="font-size:15px;"><span>إجمالي الفاتورة: <b id="ieTotal">${fmt(r2(sumBy(ed.rows, _ieSub)))} ج</b></span></div>
    <div class="modal-act"><button class="btn btn-ghost" onclick="closeEditModal()">إلغاء</button><button class="btn btn-cheese" id="ieSave" onclick="saveInvEditor()">حفظ التعديل</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeEditModal(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditModal(); });
}
async function saveInvEditor(){
  const ed = _invEd; if (!ed) return;
  const c = getClient(ed.clientId); const inv = c && c.invoices.find(i => i.id === ed.invoiceId); if (!inv) return;
  if (!ed.rows.length) { showToast('الفاتورة لازم يكون فيها صنف واحد على الأقل (أو احذف الفاتورة)'); return; }
  const items = [];
  for (const r of ed.rows) {
    const q = num(r.qty), p = num(r.price);
    if (!r.productId && !r.productName) { showToast('اختار الصنف في كل الصفوف'); return; }
    if (isNaN(q) || q <= 0) { showToast('اكتب الكمية في كل الصفوف'); return; }
    if (isNaN(p) || p < 0) { showToast('اكتب سعر الوحدة في كل الصفوف'); return; }
    items.push({ productId: r.productId || null, productName: r.productName, quantity: q, unitPrice: p });
  }
  const body = { items };
  const dt = composeDate(ed.day, inv.date); if (dt) body.date = dt;
  try {
    const json = await apiFetch('invoices/' + ed.invoiceId, 'PUT', body);
    Object.assign(inv, json.invoice);
    closeEditModal(); _invEd = null; render(); showToast('اتعدّلت الفاتورة');
  } catch (e) {}
}
