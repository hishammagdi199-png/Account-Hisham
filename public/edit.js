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
  openEditModal({ title: 'تعديل حركة في حسابي', fields: [
    { key: 'type', label: 'النوع', type: 'select', value: e.type, options: [{ v: 'out', l: 'مصروف' }, { v: 'in', l: 'إيداع' }] },
    { key: 'amount', label: 'المبلغ', type: 'num', value: e.amount },
    { key: 'party', label: 'الجهة (فين / لمين / منين)', type: 'text', value: e.party },
    { key: 'category', label: 'التصنيف', type: 'text', value: e.category },
    { key: 'note', label: 'ملاحظات', type: 'area', value: e.note },
    { key: 'day', label: 'التاريخ', type: 'date', value: localDateStr(e.date) },
  ], onSave: async (v) => {
    if (_badAmount(v.amount)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
    const body = { type: v.type, amount: v.amount, party: v.party, category: v.category, note: v.note };
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
