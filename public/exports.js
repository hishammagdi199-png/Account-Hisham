/* ===== exports.js: تصدير إكسيل منسّق — كل قسم لوحده بكل تفاصيله ===== */
// الوسيط الأخير all: false = الفترة المعروضة فقط، true = كل التفاصيل (كل التواريخ)
const _asc = (a, b) => new Date(a.d) - new Date(b.d);
const _filt = (all) => (all ? () => true : (iso) => inRange(iso));
const _en = (x) => Number(x || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });   // أرقام إنجليزية جوه النصوص
function _tag(all){
  if (all) return 'كل_التفاصيل';
  const b = rangeBounds();
  return b ? (b[0] === b[1] ? b[0] : b[0] + '_إلى_' + b[1]) : 'الكل';
}
const _periodName = (all) => (all ? 'كل التواريخ' : rangeLabel());
const _sub = (all) => 'الفترة: ' + _periodName(all) + '     •     تاريخ التصدير: ' + localDateStr(new Date());
const _col = (bad) => (bad ? XL.debit : XL.credit);

// الرصيد بعد كل عملية (فاتورة أو دفعة) على مدار كل التاريخ — بيتعرض جنب كل صف
function _clientBalMap(c){
  let run = 0; const m = {};
  _clientEvents(c).forEach(e => { run += e.t === 'فاتورة' ? e.ref.total : -e.ref.amount; m[e.ref.id] = r2(run); });
  return m;
}
function _supBalMap(s){
  let run = 0; const m = {};
  s.txns.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => { run += t.kind === 'goods' ? t.amount : -t.amount; m[t.id] = r2(run); });
  return m;
}
const _idxL = (cols, key) => _colL(cols.findIndex(c => c.k === key) + 1);

/* ---------------- العملاء ---------------- */
function _clientEvents(c){
  return [
    ...c.invoices.map(i => ({ d: i.date, t: 'فاتورة', ref: i })),
    ...c.payments.map(p => ({ d: p.date, t: 'دفعة', ref: p })),
  ].sort(_asc);
}
const _invText = (inv) => inv.items.map(it => `${it.productName}  ×${_en(it.quantity)}  @ ${_en(it.unitPrice)}  =  ${_en(it.subtotal)}`).join('\n');

// كشف حساب العميل: التاريخ | البيان (تفاصيل الفاتورة) | قيمة الفاتورة | الدفعة | الرصيد بعد الخصم
function _clientStatement(wb, c, f, all, sheetName){
  let run = 0, opening = null; const per = [];
  _clientEvents(c).forEach(e => {
    const before = run;
    run += e.t === 'فاتورة' ? e.ref.total : -e.ref.amount;
    if (f(e.d)) { if (opening === null) opening = before; per.push({ e, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, kind: 'رصيد سابق', desc: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  per.forEach((x, i) => {
    const inv = x.e.t === 'فاتورة';
    rows.push({ n: i + 1, date: x.e.d, kind: x.e.t,
      desc: inv ? _invText(x.e.ref) : (x.e.ref.note ? 'دفعة — ' + x.e.ref.note : 'دفعة نقدية'),
      debit: inv ? x.e.ref.total : null, credit: inv ? null : x.e.ref.amount, bal: x.bal });
  });
  const inV = per.filter(x => x.e.t === 'فاتورة'), pyV = per.filter(x => x.e.t === 'دفعة');
  const bal = clientBalance(c);
  xlTable(wb, sheetName || 'كشف الحساب', {
    title: 'كشف حساب العميل: ' + c.name, subtitle: _sub(all),
    stats: [
      { label: 'إجمالي الفواتير', value: r2(sumBy(inV, x => x.e.ref.total)), color: XL.debit },
      { label: 'إجمالي المدفوع', value: r2(sumBy(pyV, x => x.e.ref.amount)), color: XL.credit },
      { label: bal > 0 ? 'المتبقي على العميل (الرصيد الحالي)' : 'الرصيد الحالي', value: bal, color: _col(bal > 0.004) },
    ],
    cols: [
      { h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'النوع', k: 'kind', w: 12 },
      { h: 'البيان / تفاصيل الفاتورة', k: 'desc', w: 52, wrap: true },
      { h: 'قيمة الفاتورة', k: 'debit', w: 16, t: 'money', color: 'debit' },
      { h: 'الدفعة (بتتخصم)', k: 'credit', w: 17, t: 'money', color: 'credit' },
      { h: 'الرصيد المتبقي', k: 'bal', w: 18, t: 'money' },
    ],
    rows, balance: { key: 'bal', plus: 'debit', minus: 'credit' },
    total: { label: 'الإجمالي', labelKey: 'desc', sums: ['debit', 'credit'], balKey: true },
  });
}
function _clientDetails(wb, c, f, all, sheetName, withName){
  const rows = []; let n = 0;
  c.invoices.filter(i => f(i.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(inv => {
    n++;
    inv.items.forEach((it, i) => rows.push({ who: c.name, g: c.id + n, inv: n, date: inv.date, item: it.productName, qty: it.quantity,
      price: it.unitPrice, sub: it.subtotal, invTotal: i === 0 ? inv.total : null }));
  });
  xlTable(wb, sheetName || 'تفاصيل الفواتير', {
    title: 'تفاصيل فواتير العميل: ' + c.name, subtitle: _sub(all), groupKey: 'g',
    cols: [{ h: 'رقم الفاتورة', k: 'inv', w: 11, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الصنف', k: 'item', w: 30 },
      { h: 'الكمية', k: 'qty', w: 10, t: 'qty' }, { h: 'سعر الوحدة', k: 'price', w: 14, t: 'money' }, { h: 'إجمالي الصنف', k: 'sub', w: 16, t: 'money' },
      { h: 'إجمالي الفاتورة', k: 'invTotal', w: 17, t: 'money', color: 'debit' }],
    rows, total: { label: 'الإجمالي', labelKey: 'item', sums: ['sub', 'invTotal'] },
  });
}
// الفواتير: صف واحد لكل فاتورة (بكل أصنافها في خانة التفاصيل)
function _clientInvRows(c, f, withName){
  const bm = _clientBalMap(c);
  return c.invoices.filter(i => f(i.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).map((inv, i) => ({
    who: c.name, n: i + 1, date: inv.date, items: _invText(inv), cnt: inv.items.length, qty: sumBy(inv.items, x => x.quantity), total: inv.total, bal: bm[inv.id] }));
}
const _clientInvCols = (withName) => [].concat(withName ? [{ h: 'العميل', k: 'who', w: 22 }] : [],
  [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الأصناف (تفاصيل الفاتورة)', k: 'items', w: 52, wrap: true },
   { h: 'عدد الأصناف', k: 'cnt', w: 11, t: 'int' }, { h: 'إجمالي الكميات', k: 'qty', w: 13, t: 'qty' }, { h: 'قيمة الفاتورة', k: 'total', w: 16, t: 'money', color: 'debit' },
   { h: 'المتبقي على العميل بعد الفاتورة', k: 'bal', w: 22, t: 'money', color: 'sign' }]);
function _clientPayRows(c, f){
  const bm = _clientBalMap(c);
  return c.payments.filter(p => f(p.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).map((p, i) => ({
    who: c.name, n: i + 1, date: p.date, amount: p.amount, note: p.note || '', bal: bm[p.id] }));
}
const _clientPayCols = (withName) => [].concat(withName ? [{ h: 'العميل', k: 'who', w: 22 }] : [{ h: '#', k: 'n', w: 6, t: 'int' }],
  [{ h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'المبلغ', k: 'amount', w: 16, t: 'money', color: 'credit' }, { h: 'ملاحظة / بيان', k: 'note', w: 40, wrap: true },
   { h: 'المتبقي على العميل بعد الدفعة', k: 'bal', w: 22, t: 'money', color: 'sign' }]);
function _clientPayments(wb, c, f, all, sheetName){
  xlTable(wb, sheetName || 'الدفعات', {
    title: 'دفعات العميل: ' + c.name, subtitle: _sub(all),
    cols: _clientPayCols(false), rows: _clientPayRows(c, f), total: { label: 'الإجمالي', labelKey: 'date', sums: ['amount'] },
  });
}
function _clientInvoices(wb, c, f, all, sheetName){
  xlTable(wb, sheetName || 'الفواتير', {
    title: 'فواتير العميل: ' + c.name + ' (صف لكل فاتورة)', subtitle: _sub(all),
    cols: _clientInvCols(false), rows: _clientInvRows(c, f), total: { label: 'الإجمالي', labelKey: 'items', sums: ['cnt', 'qty', 'total'] },
  });
}
// حساب عميل واحد بس
function exportClient(id, all){
  const c = getClient(id); if (!c) return;
  const f = _filt(all);
  xlExport('حساب_' + c.name + '_' + _tag(all), (wb) => {
    _clientStatement(wb, c, f, all, 'كشف الحساب');
    _clientInvoices(wb, c, f, all, 'الفواتير');
    _clientDetails(wb, c, f, all, 'تفاصيل الأصناف');
    _clientPayments(wb, c, f, all, 'الدفعات');
  });
}
// كل العملاء: ملخص + كل الفواتير + كل الدفعات + كشف حساب منفصل لكل عميل
function exportAll(all){
  if (!state.clients.length) { showToast('مفيش عملاء لتصديرهم'); return; }
  const f = _filt(all);
  xlExport('حساب_كل_العملاء_' + _tag(all), (wb) => {
    const sumRows = state.clients.map((c, i) => ({ n: i + 1, who: c.name,
      inv: r2(sumBy(c.invoices.filter(x => f(x.date)), x => x.total)), pay: r2(sumBy(c.payments.filter(x => f(x.date)), x => x.amount)), bal: clientBalance(c) }));
    xlTable(wb, 'ملخص العملاء', {
      title: 'ملخص حسابات العملاء', subtitle: _sub(all),
      stats: [{ label: 'عدد العملاء', value: state.clients.length, fmt: '0' },
        { label: 'إجمالي المطلوب من العملاء', value: r2(sumBy(state.clients, clientBalance)), color: XL.debit }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'العميل', k: 'who', w: 28 }, { h: 'إجمالي الفواتير', k: 'inv', w: 18, t: 'money', color: 'debit' },
        { h: 'إجمالي المدفوع', k: 'pay', w: 18, t: 'money', color: 'credit' }, { h: 'الرصيد المتبقي (الحالي)', k: 'bal', w: 22, t: 'money', color: 'sign' }],
      rows: sumRows, total: { label: 'الإجمالي', labelKey: 'who', sums: ['inv', 'pay', 'bal'] },
    });
    xlTable(wb, 'كل الفواتير', { title: 'كل فواتير العملاء (صف لكل فاتورة)', subtitle: _sub(all), cols: _clientInvCols(true),
      rows: state.clients.flatMap(c => _clientInvRows(c, f)), total: { label: 'الإجمالي', labelKey: 'items', sums: ['cnt', 'qty', 'total'] } });
    const all1 = [];
    state.clients.forEach(c => { let n = 0; c.invoices.filter(i => f(i.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(inv => { n++;
      inv.items.forEach((it, i) => all1.push({ who: c.name, g: c.id + n, inv: n, date: inv.date, item: it.productName, qty: it.quantity, price: it.unitPrice, sub: it.subtotal, invTotal: i === 0 ? inv.total : null })); }); });
    xlTable(wb, 'تفاصيل الأصناف', { title: 'تفاصيل أصناف كل الفواتير (صف لكل صنف)', subtitle: _sub(all), groupKey: 'g',
      cols: [{ h: 'العميل', k: 'who', w: 22 }, { h: 'رقم الفاتورة', k: 'inv', w: 11, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الصنف', k: 'item', w: 28 },
        { h: 'الكمية', k: 'qty', w: 10, t: 'qty' }, { h: 'سعر الوحدة', k: 'price', w: 14, t: 'money' }, { h: 'إجمالي الصنف', k: 'sub', w: 16, t: 'money' },
        { h: 'إجمالي الفاتورة', k: 'invTotal', w: 17, t: 'money', color: 'debit' }],
      rows: all1, total: { label: 'الإجمالي', labelKey: 'item', sums: ['sub', 'invTotal'] } });
    xlTable(wb, 'كل الدفعات', { title: 'كل دفعات العملاء', subtitle: _sub(all), cols: _clientPayCols(true),
      rows: state.clients.flatMap(c => _clientPayRows(c, f)).sort((a, b) => new Date(a.date) - new Date(b.date)), total: { label: 'الإجمالي', labelKey: 'who', sums: ['amount'] } });
    state.clients.forEach(c => _clientStatement(wb, c, f, all, c.name));
  });
}

/* ---------------- تحصيل اليوم ---------------- */
function exportToday(all){
  const f = _filt(all);
  const pays = [];
  state.clients.forEach(c => c.payments.forEach(p => { if (f(p.date)) pays.push({ c, p }); }));
  pays.sort((a, b) => new Date(a.p.date) - new Date(b.p.date));
  const sales = [];
  state.clients.forEach(c => c.invoices.forEach(i => { if (f(i.date)) sales.push({ c, i }); }));
  sales.sort((a, b) => new Date(a.i.date) - new Date(b.i.date));
  const byClient = {}, byDay = {};
  pays.forEach(x => {
    const a = (byClient[x.c.name] ||= { n: 0, t: 0 }); a.n++; a.t += x.p.amount;
    const k = localDateStr(x.p.date), b = (byDay[k] ||= { n: 0, t: 0 }); b.n++; b.t += x.p.amount;
  });
  const balMaps = {}; state.clients.forEach(c => { balMaps[c.id] = _clientBalMap(c); });
  xlExport('تحصيل_' + _tag(all), (wb) => {
    xlTable(wb, 'التحصيل', {
      title: 'تحصيل العملاء', subtitle: _sub(all),
      stats: [{ label: 'إجمالي التحصيل', value: r2(sumBy(pays, x => x.p.amount)), color: XL.credit },
        { label: 'عدد الدفعات', value: pays.length, fmt: '0' },
        { label: 'مبيعات الفترة', value: r2(sumBy(sales, x => x.i.total)), color: XL.debit }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'العميل', k: 'who', w: 26 },
        { h: 'البيان / ملاحظة', k: 'note', w: 38, wrap: true }, { h: 'المبلغ', k: 'amount', w: 16, t: 'money', color: 'credit' },
        { h: 'المتبقي على العميل بعد الدفعة', k: 'cbal', w: 22, t: 'money', color: 'sign' }, { h: 'إجمالي التحصيل التراكمي', k: 'cum', w: 20, t: 'money' }],
      rows: (() => { let cum = 0; return pays.map((x, i) => { cum = r2(cum + x.p.amount); return { n: i + 1, date: x.p.date, who: x.c.name, note: x.p.note || '', amount: x.p.amount, cbal: balMaps[x.c.id][x.p.id], cum }; }); })(),
      balance: { key: 'cum', plus: 'amount', posGood: true },
      total: { label: 'الإجمالي', labelKey: 'who', sums: ['amount'], balKey: true },
    });
    xlTable(wb, 'حسب العميل', { title: 'التحصيل حسب العميل', subtitle: _sub(all),
      cols: [{ h: 'العميل', k: 'who', w: 28 }, { h: 'عدد الدفعات', k: 'n', w: 14, t: 'int' }, { h: 'الإجمالي', k: 't', w: 18, t: 'money', color: 'credit' }],
      rows: Object.entries(byClient).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => ({ who: k, n: v.n, t: r2(v.t) })),
      total: { label: 'الإجمالي', labelKey: 'who', sums: ['n', 't'] } });
    xlTable(wb, 'حسب اليوم', { title: 'التحصيل حسب اليوم', subtitle: _sub(all),
      cols: [{ h: 'اليوم', k: 'day', w: 18 }, { h: 'عدد الدفعات', k: 'n', w: 14, t: 'int' }, { h: 'الإجمالي', k: 't', w: 18, t: 'money', color: 'credit' }],
      rows: Object.entries(byDay).sort().map(([k, v]) => ({ day: k, n: v.n, t: r2(v.t) })),
      total: { label: 'الإجمالي', labelKey: 'day', sums: ['n', 't'] } });
    xlTable(wb, 'فواتير الفترة', { title: 'فواتير الفترة', subtitle: _sub(all),
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'العميل', k: 'who', w: 24 }, { h: 'الأصناف (تفاصيل الفاتورة)', k: 'items', w: 52, wrap: true },
        { h: 'عدد الأصناف', k: 'cnt', w: 11, t: 'int' }, { h: 'قيمة الفاتورة', k: 'total', w: 16, t: 'money', color: 'debit' }, { h: 'المتبقي على العميل بعد الفاتورة', k: 'cbal', w: 22, t: 'money', color: 'sign' }],
      rows: sales.map((x, i) => ({ n: i + 1, date: x.i.date, who: x.c.name, items: _invText(x.i), cnt: x.i.items.length, total: x.i.total, cbal: balMaps[x.c.id][x.i.id] })),
      total: { label: 'الإجمالي', labelKey: 'who', sums: ['cnt', 'total'] } });
  });
}

/* ---------------- الموردين ---------------- */
// ملحوظة: حساب المورد فيه تفاصيل فواتيره هو بس (صنف / كمية / سعر الشراء / الإجمالي) — سعر البيع والربح تخصك إنت ومش بتتصدّر
const _supItemsText = (items) => items.map(it => `${it.productName}  ×${_en(it.quantity)}  @ ${_en(it.unitCost)}  =  ${_en(it.subtotal)}`).join('\n');
const _supText = (t) => {
  if (t.kind === 'goods') {
    const hasItems = t.items && t.items.length;
    return (hasItems ? _supItemsText(t.items) : (t.note || 'بضاعة')) + ((hasItems && t.note) ? '\nملاحظة: ' + t.note : '');
  }
  return (t.note ? 'دفعة — ' + t.note : 'دفعة نقدية') + (t.fromCash ? '' : ' (من برّه الخزنة)');
};
function _supStatement(wb, s, f, all, sheetName){
  let run = 0, opening = null; const per = [];
  s.txns.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    const before = run;
    run += t.kind === 'goods' ? t.amount : -t.amount;
    if (f(t.date)) { if (opening === null) opening = before; per.push({ t, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, kind: 'رصيد سابق', desc: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  per.forEach((x, i) => rows.push({ n: i + 1, date: x.t.date, kind: x.t.kind === 'goods' ? 'بضاعة' : 'دفعة', desc: _supText(x.t),
    debit: x.t.kind === 'goods' ? x.t.amount : null, credit: x.t.kind === 'payment' ? x.t.amount : null, bal: x.bal }));
  const goods = per.filter(x => x.t.kind === 'goods').map(x => x.t), paid = per.filter(x => x.t.kind === 'payment').map(x => x.t);
  const bal = supplierBalance(s);
  xlTable(wb, sheetName || 'كشف الحساب', {
    title: 'كشف حساب المورد: ' + s.name, subtitle: _sub(all),
    stats: [
      { label: 'إجمالي البضاعة', value: r2(sumBy(goods, t => t.amount)), color: XL.debit },
      { label: 'إجمالي المدفوع', value: r2(sumBy(paid, t => t.amount)), color: XL.credit },
      { label: bal > 0 ? 'المتبقي للمورد' : 'الرصيد الحالي', value: bal, color: _col(bal > 0.004) },
    ],
    cols: [
      { h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'النوع', k: 'kind', w: 12 },
      { h: 'البيان / تفاصيل الفاتورة', k: 'desc', w: 52, wrap: true },
      { h: 'قيمة البضاعة', k: 'debit', w: 16, t: 'money', color: 'debit' },
      { h: 'المدفوع للمورد (بيتخصم)', k: 'credit', w: 20, t: 'money', color: 'credit' },
      { h: 'المتبقي للمورد', k: 'bal', w: 18, t: 'money' },
    ],
    rows, balance: { key: 'bal', plus: 'debit', minus: 'credit' },
    total: { label: 'الإجمالي', labelKey: 'desc', sums: ['debit', 'credit'], balKey: true },
  });
}
// تفاصيل الأصناف: صف لكل صنف
function _supDetailRows(s, f){
  const rows = []; let n = 0;
  s.txns.filter(t => t.kind === 'goods' && f(t.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    n++;
    const items = t.items || [];
    if (!items.length) { rows.push({ who: s.name, g: s.id + n, inv: n, date: t.date, item: '(مبلغ بدون تفاصيل أصناف)', sub: t.amount, invTotal: t.amount }); return; }
    items.forEach((it, i) => rows.push({ who: s.name, g: s.id + n, inv: n, date: t.date, item: it.productName, qty: it.quantity, cost: it.unitCost,
      sub: it.subtotal, invTotal: i === 0 ? t.amount : null }));
  });
  return rows;
}
const _supDetailCols = (withName) => [].concat(withName ? [{ h: 'المورد', k: 'who', w: 22 }] : [],
  [{ h: 'رقم الفاتورة', k: 'inv', w: 11, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الصنف', k: 'item', w: 30 }, { h: 'الكمية', k: 'qty', w: 10, t: 'qty' },
   { h: 'سعر الوحدة', k: 'cost', w: 14, t: 'money' }, { h: 'إجمالي الصنف', k: 'sub', w: 16, t: 'money' }, { h: 'إجمالي الفاتورة', k: 'invTotal', w: 17, t: 'money', color: 'debit' }]);
const _supDetailTotal = () => ({ label: 'الإجمالي', labelKey: 'item', sums: ['sub', 'invTotal'] });
// الفواتير: صف واحد لكل فاتورة
function _supInvRows(s, f){
  const bm = _supBalMap(s);
  return s.txns.filter(t => t.kind === 'goods' && f(t.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).map((t, i) => {
    const items = t.items || [];
    return { who: s.name, n: i + 1, date: t.date,
      items: items.length ? _supItemsText(items) : (t.note || 'بضاعة (بدون تفاصيل أصناف)'),
      cnt: items.length, total: t.amount, note: items.length ? (t.note || '') : '', bal: bm[t.id] };
  });
}
const _supInvCols = (withName) => [].concat(withName ? [{ h: 'المورد', k: 'who', w: 22 }] : [],
  [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الأصناف (تفاصيل الفاتورة)', k: 'items', w: 54, wrap: true },
   { h: 'عدد الأصناف', k: 'cnt', w: 11, t: 'int' }, { h: 'قيمة الفاتورة', k: 'total', w: 17, t: 'money', color: 'debit' }, { h: 'ملاحظة', k: 'note', w: 26, wrap: true },
   { h: 'المتبقي للمورد بعد الفاتورة', k: 'bal', w: 22, t: 'money', color: 'sign' }]);
const _supInvTotal = () => ({ label: 'الإجمالي', labelKey: 'items', sums: ['cnt', 'total'] });
function _supPayRows(s, f){
  const bm = _supBalMap(s);
  return s.txns.filter(t => t.kind === 'payment' && f(t.date)).sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((t, i) => ({ n: i + 1, who: s.name, date: t.date, amount: t.amount, cash: t.fromCash ? 'نعم' : 'لا', note: t.note || '', bal: bm[t.id] }));
}
const _supPayCols = (withName) => [].concat(withName ? [{ h: 'المورد', k: 'who', w: 22 }] : [{ h: '#', k: 'n', w: 6, t: 'int' }],
  [{ h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'المبلغ', k: 'amount', w: 16, t: 'money', color: 'credit' }, { h: 'من الخزنة؟', k: 'cash', w: 12 }, { h: 'ملاحظة / بيان', k: 'note', w: 40, wrap: true },
   { h: 'المتبقي للمورد بعد الدفعة', k: 'bal', w: 22, t: 'money', color: 'sign' }]);

// حساب مورد واحد بس
function exportSupplier(id, all){
  const s = getSupplier(id); if (!s) return;
  const f = _filt(all);
  xlExport('مورد_' + s.name + '_' + _tag(all), (wb) => {
    _supStatement(wb, s, f, all, 'كشف الحساب');
    xlTable(wb, 'الفواتير', { title: 'فواتير المورد: ' + s.name + ' (صف لكل فاتورة)', subtitle: _sub(all), cols: _supInvCols(false), rows: _supInvRows(s, f), total: _supInvTotal() });
    const rows = _supDetailRows(s, f);
    xlTable(wb, 'تفاصيل الأصناف', { title: 'تفاصيل فواتير المورد: ' + s.name, subtitle: _sub(all), groupKey: 'g',
      cols: _supDetailCols(false), rows, total: _supDetailTotal() });
    xlTable(wb, 'الدفعات', { title: 'دفعات المورد: ' + s.name, subtitle: _sub(all), cols: _supPayCols(false), rows: _supPayRows(s, f),
      total: { label: 'الإجمالي', labelKey: 'date', sums: ['amount'] } });
  });
}
// كل الموردين
function exportSuppliersAll(all){
  if (!state.suppliers.length) { showToast('مفيش موردين لتصديرهم'); return; }
  const f = _filt(all);
  xlExport('حساب_كل_الموردين_' + _tag(all), (wb) => {
    const sum = state.suppliers.map((s, i) => ({ n: i + 1, who: s.name,
      goods: r2(sumBy(s.txns.filter(t => t.kind === 'goods' && f(t.date)), t => t.amount)),
      paid: r2(sumBy(s.txns.filter(t => t.kind === 'payment' && f(t.date)), t => t.amount)), bal: supplierBalance(s) }));
    xlTable(wb, 'ملخص الموردين', {
      title: 'ملخص حسابات الموردين', subtitle: _sub(all),
      stats: [{ label: 'عدد الموردين', value: state.suppliers.length, fmt: '0' }, { label: 'إجمالي المطلوب للموردين', value: r2(sumBy(state.suppliers, supplierBalance)), color: XL.debit }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'المورد', k: 'who', w: 26 }, { h: 'إجمالي البضاعة', k: 'goods', w: 17, t: 'money', color: 'debit' },
        { h: 'إجمالي المدفوع', k: 'paid', w: 17, t: 'money', color: 'credit' }, { h: 'المتبقي للمورد (الحالي)', k: 'bal', w: 22, t: 'money', color: 'sign' }],
      rows: sum, total: { label: 'الإجمالي', labelKey: 'who', sums: ['goods', 'paid', 'bal'] },
    });
    xlTable(wb, 'كل الفواتير', { title: 'كل فواتير الموردين (صف لكل فاتورة)', subtitle: _sub(all), cols: _supInvCols(true),
      rows: state.suppliers.flatMap(s => _supInvRows(s, f)), total: _supInvTotal() });
    xlTable(wb, 'تفاصيل الأصناف', { title: 'تفاصيل أصناف كل الفواتير (صف لكل صنف)', subtitle: _sub(all), groupKey: 'g', cols: _supDetailCols(true),
      rows: state.suppliers.flatMap(s => _supDetailRows(s, f)), total: _supDetailTotal() });
    xlTable(wb, 'كل الدفعات', { title: 'كل دفعات الموردين', subtitle: _sub(all), cols: _supPayCols(true),
      rows: state.suppliers.flatMap(s => _supPayRows(s, f)), total: { label: 'الإجمالي', labelKey: 'who', sums: ['amount'] } });
    state.suppliers.forEach(s => _supStatement(wb, s, f, all, s.name));
  });
}

/* ---------------- الخزنة (لوحدها) ---------------- */
function exportCash(all){
  const f = _filt(all);
  const asc = cashMovements().slice().reverse();
  const srcName = { client: 'تحصيل عميل', supplier: 'دفعة مورد', manual: 'حركة يدوية' };
  let run = 0, opening = null; const per = [];
  asc.forEach(m => {
    const before = run;
    run += m.dir === 'in' ? m.amount : -m.amount;
    if (f(m.date)) { if (opening === null) opening = before; per.push({ m, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, src: 'رصيد سابق', who: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  per.forEach((x, i) => rows.push({ n: i + 1, date: x.m.date, src: srcName[x.m.src], who: x.m.label, desc: x.m.detail || '',
    inn: x.m.dir === 'in' ? x.m.amount : null, out: x.m.dir === 'out' ? x.m.amount : null, bal: x.bal }));
  const byReason = {};
  per.filter(x => x.m.src === 'manual' && x.m.dir === 'out').forEach(x => { const k = (x.m.detail || 'بدون سبب').trim(); const a = (byReason[k] ||= { n: 0, t: 0 }); a.n++; a.t += x.m.amount; });
  const tin = r2(sumBy(per.filter(x => x.m.dir === 'in'), x => x.m.amount)), tout = r2(sumBy(per.filter(x => x.m.dir === 'out'), x => x.m.amount));
  xlExport('الخزنة_' + _tag(all), (wb) => {
    xlTable(wb, 'حركات الخزنة', {
      title: 'حركات الخزنة', subtitle: _sub(all),
      stats: [{ label: 'رصيد الخزنة الحالي', value: r2(run), color: _col(run < -0.004) }, { label: 'إجمالي الداخل (الفترة)', value: tin, color: XL.credit }, { label: 'إجمالي الخارج (الفترة)', value: tout, color: XL.debit }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'المصدر', k: 'src', w: 14 }, { h: 'الجهة', k: 'who', w: 28, wrap: true },
        { h: 'البيان / السبب', k: 'desc', w: 40, wrap: true }, { h: 'داخل', k: 'inn', w: 15, t: 'money', color: 'credit' }, { h: 'خارج', k: 'out', w: 15, t: 'money', color: 'debit' },
        { h: 'الرصيد', k: 'bal', w: 17, t: 'money' }],
      rows, balance: { key: 'bal', plus: 'inn', minus: 'out', posGood: true },
      total: { label: 'الإجمالي', labelKey: 'who', sums: ['inn', 'out'], balKey: true },
    });
    xlTable(wb, 'المصروفات حسب السبب', { title: 'المصروفات اليدوية حسب السبب', subtitle: _sub(all),
      cols: [{ h: 'السبب', k: 'r', w: 34 }, { h: 'عدد الحركات', k: 'n', w: 14, t: 'int' }, { h: 'الإجمالي', k: 't', w: 18, t: 'money', color: 'debit' }],
      rows: Object.entries(byReason).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => ({ r: k, n: v.n, t: r2(v.t) })),
      total: { label: 'الإجمالي', labelKey: 'r', sums: ['n', 't'] } });
  });
}

/* ---------------- حسابي الشخصي (لوحده) ---------------- */
function exportPersonal(all){
  const f = _filt(all);
  const asc = state.personal.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  let run = 0, opening = null; const per = [];
  asc.forEach(e => {
    const before = run;
    run += pEff(e);
    if (f(e.date)) { if (opening === null) opening = before; per.push({ e, bal: r2(run) }); }
  });
  const rows = [];
  if (!all && opening !== null && Math.abs(opening) > 0.004)
    rows.push({ _open: true, _bold: true, _fill: 'FFEFE8D2', _nosum: true, kind: 'رصيد سابق', party: 'رصيد مرحَّل قبل الفترة', bal: r2(opening) });
  const kindOf = (e) => e.loan === 'borrow' ? 'سلفة (استلفت)' : (e.loan === 'repay' ? 'سداد سلفة' : (e.type === 'in' ? 'إيداع' : 'مصروف'));
  per.forEach((x, i) => rows.push({ n: i + 1, date: x.e.date, kind: kindOf(x.e), party: x.e.party, cat: x.e.category,
    note: (x.e.offAccount ? '[سداد من برّه الحساب — ما اتخصمش من الرصيد] ' : '') + x.e.note,
    dep: pIn(x.e) || null, exp: pOut(x.e) || null, bal: x.bal }));
  const byCat = {};
  per.filter(x => x.e.type === 'out' && !x.e.offAccount).forEach(x => { const k = x.e.category || 'بدون تصنيف'; const a = (byCat[k] ||= { n: 0, t: 0 }); a.n++; a.t += x.e.amount; });
  const tin = r2(sumBy(per, x => pIn(x.e))), tout = r2(sumBy(per, x => pOut(x.e)));
  const debt = loansTotal();
  // السلف: ملخص لكل جهة + سجل كامل بالمتبقي بعد كل عملية
  const L = loansSummary();
  const loanEvents = [];
  L.forEach(l => { let r = 0; l.events.forEach(e => { r += e.loan === 'borrow' ? e.amount : -e.amount;
    loanEvents.push({ date: e.date, who: l.name, kind: e.loan === 'borrow' ? 'استلفت' : 'سدّدت', borrow: e.loan === 'borrow' ? e.amount : null, repay: e.loan === 'repay' ? e.amount : null,
      acct: e.loan === 'repay' ? (e.offAccount ? 'لا (من برّه الحساب)' : 'نعم') : 'نعم', note: e.note || '', rem: r2(r) }); }); });
  loanEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
  xlExport('حسابي_' + _tag(all), (wb) => {
    xlTable(wb, 'حركات حسابي', {
      title: 'حسابي الشخصي', subtitle: _sub(all),
      stats: [{ label: 'المتبقي معايا دلوقتي', value: r2(run), color: _col(run < -0.004) }, { label: 'إجمالي الإيداعات (الفترة)', value: tin, color: XL.credit },
        { label: 'إجمالي المصروفات (الفترة)', value: tout, color: XL.debit }, { label: 'عليّ سلف دلوقتي', value: debt, color: _col(debt > 0.004) }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'النوع', k: 'kind', w: 16 }, { h: 'الجهة', k: 'party', w: 24, wrap: true },
        { h: 'التصنيف', k: 'cat', w: 16 }, { h: 'ملاحظات', k: 'note', w: 38, wrap: true }, { h: 'إيداع', k: 'dep', w: 15, t: 'money', color: 'credit' },
        { h: 'مصروف', k: 'exp', w: 15, t: 'money', color: 'debit' }, { h: 'الرصيد', k: 'bal', w: 17, t: 'money' }],
      rows, balance: { key: 'bal', plus: 'dep', minus: 'exp', posGood: true },
      total: { label: 'الإجمالي', labelKey: 'party', sums: ['dep', 'exp'], balKey: true },
    });
    xlTable(wb, 'السلف', {
      title: 'السلف — اللي عليّ ولمين', subtitle: 'تاريخ التصدير: ' + localDateStr(new Date()) + '     •     (كل التواريخ)',
      stats: [{ label: 'إجمالي اللي عليّ', value: debt, color: _col(debt > 0.004) }, { label: 'عدد الجهات', value: L.length, fmt: '0' }],
      cols: [{ h: '#', k: 'n', w: 6, t: 'int' }, { h: 'الجهة (استلفت منها)', k: 'who', w: 28 }, { h: 'إجمالي اللي استلفته', k: 'b', w: 20, t: 'money', color: 'debit' },
        { h: 'إجمالي اللي سدّدته', k: 'r', w: 20, t: 'money', color: 'credit' }, { h: 'المتبقي عليّ', k: 'rem', w: 20, t: 'money', color: 'sign' }],
      rows: L.map((l, i) => ({ n: i + 1, who: l.name, b: r2(l.borrowed), r: r2(l.repaid), rem: l.remaining })),
      total: { label: 'الإجمالي', labelKey: 'who', sums: ['b', 'r', 'rem'] },
    });
    xlTable(wb, 'سجل السلف', {
      title: 'سجل السلف (استلفت / سدّدت)', subtitle: 'تاريخ التصدير: ' + localDateStr(new Date()),
      cols: [{ h: 'التاريخ', k: 'date', w: 20, t: 'date' }, { h: 'الجهة', k: 'who', w: 24 }, { h: 'العملية', k: 'kind', w: 12 },
        { h: 'استلفت', k: 'borrow', w: 15, t: 'money', color: 'debit' }, { h: 'سدّدت', k: 'repay', w: 15, t: 'money', color: 'credit' },
        { h: 'اتخصمت من حسابي؟', k: 'acct', w: 20 }, { h: 'ملاحظة', k: 'note', w: 34, wrap: true }, { h: 'المتبقي لهذه الجهة بعد العملية', k: 'rem', w: 24, t: 'money', color: 'sign' }],
      rows: loanEvents, total: { label: 'الإجمالي', labelKey: 'who', sums: ['borrow', 'repay'] },
    });
    xlTable(wb, 'المصروفات حسب التصنيف', { title: 'المصروفات حسب التصنيف', subtitle: _sub(all),
      cols: [{ h: 'التصنيف', k: 'c', w: 30 }, { h: 'عدد الحركات', k: 'n', w: 14, t: 'int' }, { h: 'الإجمالي', k: 't', w: 18, t: 'money', color: 'debit' }],
      rows: Object.entries(byCat).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => ({ c: k, n: v.n, t: r2(v.t) })),
      total: { label: 'الإجمالي', labelKey: 'c', sums: ['n', 't'] } });
  });
}
