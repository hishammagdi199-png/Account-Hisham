/* ===== exports.js: تصدير إكسيل — كل قسم لوحده بكل تفاصيله ===== */
// الوسيط الأخير all: false = الفترة المعروضة فقط، true = كل التفاصيل (كل التواريخ)
const _asc = (a, b) => new Date(a.d) - new Date(b.d);
const _filt = (all) => (all ? () => true : (iso) => inRange(iso));
function _tag(all){
  if (all) return 'كل_التفاصيل';
  const b = rangeBounds();
  return b ? (b[0] === b[1] ? b[0] : b[0] + '_إلى_' + b[1]) : 'الكل';
}
const _periodName = (all) => (all ? 'كل التواريخ' : rangeLabel());
const _itemsText = (items) => items.map(i => i.productName + ' ×' + i.quantity).join('، ');

/* ---------------- العملاء ---------------- */
function _clientEvents(c){
  return [
    ...c.invoices.map(i => ({ d: i.date, t: 'فاتورة', ref: i })),
    ...c.payments.map(p => ({ d: p.date, t: 'دفعة', ref: p })),
  ].sort(_asc);
}
function _clientLedger(c, f, withName){
  let run = 0; const rows = [];
  _clientEvents(c).forEach(e => {
    if (e.t === 'فاتورة') run += e.ref.total; else run -= e.ref.amount;
    if (!f(e.d)) return;
    const r = {};
    if (withName) r['العميل'] = c.name;
    r['التاريخ'] = xlDate(e.d);
    r['النوع'] = e.t;
    r['البيان'] = e.t === 'فاتورة' ? _itemsText(e.ref.items) : (e.ref.note || '');
    r['مدين (فاتورة)'] = e.t === 'فاتورة' ? e.ref.total : '';
    r['دائن (دفعة)'] = e.t === 'دفعة' ? e.ref.amount : '';
    r['الرصيد بعد العملية'] = r2(run);
    rows.push(r);
  });
  return rows;
}
function _clientInvoiceLines(c, f, withName){
  const rows = []; let n = 0;
  c.invoices.filter(i => f(i.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(inv => {
    n++;
    inv.items.forEach(it => {
      const r = {};
      if (withName) r['العميل'] = c.name;
      r['رقم الفاتورة'] = n;
      r['التاريخ'] = xlDate(inv.date);
      r['الصنف'] = it.productName;
      r['الكمية'] = it.quantity;
      r['سعر الوحدة'] = it.unitPrice;
      r['الإجمالي'] = it.subtotal;
      r['إجمالي الفاتورة'] = inv.total;
      rows.push(r);
    });
  });
  return rows;
}
function _clientPayLines(c, f, withName){
  return c.payments.filter(p => f(p.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => {
    const r = {};
    if (withName) r['العميل'] = c.name;
    r['التاريخ'] = xlDate(p.date); r['المبلغ'] = p.amount; r['ملاحظة'] = p.note || '';
    return r;
  });
}
// حساب عميل واحد بس
function exportClient(id, all){
  const c = getClient(id); if (!c) return;
  const f = _filt(all);
  const inv = c.invoices.filter(i => f(i.date)), pay = c.payments.filter(p => f(p.date));
  xlSave('حساب_' + c.name + '_' + _tag(all), [
    { name: 'ملخص', rows: [
      { 'البند': 'العميل', 'القيمة': c.name },
      { 'البند': 'الفترة', 'القيمة': _periodName(all) },
      { 'البند': 'عدد الفواتير', 'القيمة': inv.length },
      { 'البند': 'إجمالي الفواتير', 'القيمة': r2(sumBy(inv, i => i.total)) },
      { 'البند': 'عدد الدفعات', 'القيمة': pay.length },
      { 'البند': 'إجمالي المدفوع', 'القيمة': r2(sumBy(pay, p => p.amount)) },
      { 'البند': 'الرصيد الحالي (المطلوب من العميل)', 'القيمة': clientBalance(c) },
    ] },
    { name: 'كشف الحساب', rows: _clientLedger(c, f, false) },
    { name: 'تفاصيل الفواتير', rows: _clientInvoiceLines(c, f, false) },
    { name: 'الدفعات', rows: _clientPayLines(c, f, false) },
  ]);
}
// كل العملاء
function exportAll(all){
  if (!state.clients.length) { showToast('مفيش عملاء لتصديرهم'); return; }
  const f = _filt(all);
  xlSave('حساب_كل_العملاء_' + _tag(all), [
    { name: 'ملخص العملاء', rows: state.clients.map(c => ({
      'العميل': c.name,
      'إجمالي الفواتير': r2(sumBy(c.invoices.filter(i => f(i.date)), i => i.total)),
      'إجمالي المدفوع': r2(sumBy(c.payments.filter(p => f(p.date)), p => p.amount)),
      'الرصيد الحالي': clientBalance(c),
    })) },
    { name: 'كل الفواتير', rows: state.clients.flatMap(c => _clientInvoiceLines(c, f, true)) },
    { name: 'كل الدفعات', rows: state.clients.flatMap(c => _clientPayLines(c, f, true)) },
    { name: 'كشف الحساب', rows: state.clients.flatMap(c => _clientLedger(c, f, true)) },
  ]);
}

/* ---------------- تحصيل اليوم ---------------- */
function exportToday(all){
  const f = _filt(all);
  const pays = [];
  state.clients.forEach(c => c.payments.forEach(p => { if (f(p.date)) pays.push({ c, p }); }));
  pays.sort((a, b) => new Date(a.p.date) - new Date(b.p.date));
  const byClient = {}, byDay = {};
  pays.forEach(x => {
    const a = (byClient[x.c.name] ||= { n: 0, t: 0 }); a.n++; a.t += x.p.amount;
    const k = localDateStr(x.p.date), b = (byDay[k] ||= { n: 0, t: 0 }); b.n++; b.t += x.p.amount;
  });
  const sales = [];
  state.clients.forEach(c => c.invoices.forEach(i => { if (f(i.date)) sales.push({ c, i }); }));
  sales.sort((a, b) => new Date(a.i.date) - new Date(b.i.date));
  xlSave('تحصيل_' + _tag(all), [
    { name: 'التحصيل', rows: pays.map(x => ({ 'التاريخ': xlDate(x.p.date), 'العميل': x.c.name, 'المبلغ': x.p.amount, 'ملاحظة': x.p.note || '' })) },
    { name: 'حسب العميل', rows: Object.entries(byClient).map(([k, v]) => ({ 'العميل': k, 'عدد الدفعات': v.n, 'الإجمالي': r2(v.t) })) },
    { name: 'حسب اليوم', rows: Object.entries(byDay).sort().map(([k, v]) => ({ 'اليوم': k, 'عدد الدفعات': v.n, 'الإجمالي': r2(v.t) })) },
    { name: 'فواتير الفترة', rows: sales.map(x => ({ 'التاريخ': xlDate(x.i.date), 'العميل': x.c.name, 'الأصناف': _itemsText(x.i.items), 'الإجمالي': x.i.total })) },
    { name: 'ملخص', rows: [
      { 'البند': 'الفترة', 'القيمة': _periodName(all) },
      { 'البند': 'إجمالي التحصيل', 'القيمة': r2(sumBy(pays, x => x.p.amount)) },
      { 'البند': 'عدد الدفعات', 'القيمة': pays.length },
      { 'البند': 'إجمالي مبيعات الفترة', 'القيمة': r2(sumBy(sales, x => x.i.total)) },
    ] },
  ]);
}

/* ---------------- الموردين ---------------- */
function _supEvents(s){ return s.txns.map(t => ({ d: t.date, t })).sort(_asc); }
function _supLedger(s, f, withName){
  let run = 0; const rows = [];
  _supEvents(s).forEach(({ d, t }) => {
    run += t.kind === 'goods' ? t.amount : -t.amount;
    if (!f(d)) return;
    const r = {};
    if (withName) r['المورد'] = s.name;
    r['التاريخ'] = xlDate(d);
    r['النوع'] = t.kind === 'goods' ? 'بضاعة' : 'دفعة';
    r['البيان'] = (t.items && t.items.length ? _itemsText(t.items) : '') + (t.note ? (t.items && t.items.length ? ' — ' : '') + t.note : '');
    r['بضاعة (علينا)'] = t.kind === 'goods' ? t.amount : '';
    r['مدفوع للمورد'] = t.kind === 'payment' ? t.amount : '';
    r['المتبقي للمورد'] = r2(run);
    rows.push(r);
  });
  return rows;
}
function _supInvoiceLines(s, f, withName){
  const rows = []; let n = 0;
  s.txns.filter(t => t.kind === 'goods' && f(t.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    n++;
    const items = t.items || [];
    const c = items.length ? invCalc(items) : null;
    const base = (extra) => {
      const r = {};
      if (withName) r['المورد'] = s.name;
      r['رقم الفاتورة'] = n; r['التاريخ'] = xlDate(t.date);
      return Object.assign(r, extra);
    };
    if (!items.length) {
      rows.push(base({ 'الصنف': '(مبلغ بدون أصناف)', 'الكمية': '', 'سعر الشراء': '', 'سعر البيع': '', 'إجمالي الشراء': t.amount, 'نسبة ربح الصنف %': '',
        'إجمالي الفاتورة': t.amount, 'قيمة البيع المتوقعة': '', 'ربح الفاتورة': '', 'نسبة ربح الفاتورة %': '', 'ملاحظة': t.note || '' }));
      return;
    }
    items.forEach(it => rows.push(base({
      'الصنف': it.productName, 'الكمية': it.quantity, 'سعر الشراء': it.unitCost, 'سعر البيع': it.sellPrice, 'إجمالي الشراء': it.subtotal,
      'نسبة ربح الصنف %': it.unitCost > 0 ? Math.round((it.sellPrice - it.unitCost) / it.unitCost * 1000) / 10 : '',
      'إجمالي الفاتورة': t.amount, 'قيمة البيع المتوقعة': c.sale, 'ربح الفاتورة': c.profit, 'نسبة ربح الفاتورة %': c.pct, 'ملاحظة': t.note || '',
    })));
  });
  return rows;
}
function _supPayLines(s, f, withName){
  return s.txns.filter(t => t.kind === 'payment' && f(t.date)).sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => {
    const r = {};
    if (withName) r['المورد'] = s.name;
    r['التاريخ'] = xlDate(t.date); r['المبلغ'] = t.amount; r['من الخزنة؟'] = t.fromCash ? 'نعم' : 'لا'; r['ملاحظة'] = t.note || '';
    return r;
  });
}
// حساب مورد واحد بس
function exportSupplier(id, all){
  const s = getSupplier(id); if (!s) return;
  const f = _filt(all);
  const goods = s.txns.filter(t => t.kind === 'goods' && f(t.date)), pay = s.txns.filter(t => t.kind === 'payment' && f(t.date));
  const c = invCalc(goods.flatMap(t => t.items || []));
  xlSave('مورد_' + s.name + '_' + _tag(all), [
    { name: 'ملخص', rows: [
      { 'البند': 'المورد', 'القيمة': s.name },
      { 'البند': 'الفترة', 'القيمة': _periodName(all) },
      { 'البند': 'عدد فواتير البضاعة', 'القيمة': goods.length },
      { 'البند': 'إجمالي البضاعة', 'القيمة': r2(sumBy(goods, t => t.amount)) },
      { 'البند': 'إجمالي المدفوع', 'القيمة': r2(sumBy(pay, t => t.amount)) },
      { 'البند': 'ربح البضاعة المتوقع', 'القيمة': c.profit },
      { 'البند': 'نسبة الربح %', 'القيمة': c.pct },
      { 'البند': 'المتبقي للمورد (إجمالي الحساب)', 'القيمة': supplierBalance(s) },
    ] },
    { name: 'كشف الحساب', rows: _supLedger(s, f, false) },
    { name: 'تفاصيل الفواتير', rows: _supInvoiceLines(s, f, false) },
    { name: 'الدفعات', rows: _supPayLines(s, f, false) },
  ]);
}
// كل الموردين
function exportSuppliersAll(all){
  if (!state.suppliers.length) { showToast('مفيش موردين لتصديرهم'); return; }
  const f = _filt(all);
  xlSave('حساب_كل_الموردين_' + _tag(all), [
    { name: 'ملخص الموردين', rows: state.suppliers.map(s => {
      const g = s.txns.filter(t => t.kind === 'goods' && f(t.date));
      const c = invCalc(g.flatMap(t => t.items || []));
      return { 'المورد': s.name, 'إجمالي البضاعة': r2(sumBy(g, t => t.amount)),
        'إجمالي المدفوع': r2(sumBy(s.txns.filter(t => t.kind === 'payment' && f(t.date)), t => t.amount)),
        'ربح البضاعة المتوقع': c.profit, 'نسبة الربح %': c.pct, 'المتبقي للمورد (إجمالي الحساب)': supplierBalance(s) };
    }) },
    { name: 'كل الفواتير', rows: state.suppliers.flatMap(s => _supInvoiceLines(s, f, true)) },
    { name: 'كل الدفعات', rows: state.suppliers.flatMap(s => _supPayLines(s, f, true)) },
    { name: 'كشف الحساب', rows: state.suppliers.flatMap(s => _supLedger(s, f, true)) },
  ]);
}

/* ---------------- الخزنة (لوحدها) ---------------- */
function exportCash(all){
  const f = _filt(all);
  const asc = cashMovements().slice().reverse();         // من الأقدم للأحدث
  let run = 0; const rows = [];
  const srcName = { client: 'تحصيل عميل', supplier: 'دفعة مورد', manual: 'حركة يدوية' };
  asc.forEach(m => {
    run += m.dir === 'in' ? m.amount : -m.amount;
    if (!f(m.date)) return;
    rows.push({ 'التاريخ': xlDate(m.date), 'الاتجاه': m.dir === 'in' ? 'داخل' : 'خارج', 'المصدر': srcName[m.src],
      'الجهة': m.label, 'البيان / السبب': m.detail || '', 'داخل': m.dir === 'in' ? m.amount : '', 'خارج': m.dir === 'out' ? m.amount : '', 'الرصيد بعد الحركة': r2(run) });
  });
  const inP = asc.filter(m => f(m.date));
  const byReason = {};
  inP.filter(m => m.src === 'manual' && m.dir === 'out').forEach(m => { const k = (m.detail || 'بدون سبب').trim(); byReason[k] = (byReason[k] || 0) + m.amount; });
  xlSave('الخزنة_' + _tag(all), [
    { name: 'حركات الخزنة', rows },
    { name: 'ملخص', rows: [
      { 'البند': 'الفترة', 'القيمة': _periodName(all) },
      { 'البند': 'إجمالي الداخل', 'القيمة': r2(sumBy(inP.filter(m => m.dir === 'in'), m => m.amount)) },
      { 'البند': 'إجمالي الخارج', 'القيمة': r2(sumBy(inP.filter(m => m.dir === 'out'), m => m.amount)) },
      { 'البند': 'رصيد الخزنة الحالي', 'القيمة': r2(run) },
    ] },
    { name: 'المصروفات حسب السبب', rows: Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ 'السبب': k, 'الإجمالي': r2(v) })) },
  ]);
}

/* ---------------- حسابي الشخصي (لوحده) ---------------- */
function exportPersonal(all){
  const f = _filt(all);
  const asc = state.personal.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  let run = 0; const rows = [];
  asc.forEach(e => {
    run += e.type === 'in' ? e.amount : -e.amount;
    if (!f(e.date)) return;
    rows.push({ 'التاريخ': xlDate(e.date), 'النوع': e.type === 'in' ? 'إيداع' : 'مصروف', 'الجهة': e.party, 'التصنيف': e.category,
      'ملاحظات': e.note, 'إيداع': e.type === 'in' ? e.amount : '', 'مصروف': e.type === 'out' ? e.amount : '', 'الرصيد بعد الحركة': r2(run) });
  });
  const inP = asc.filter(e => f(e.date));
  const byCat = {};
  inP.filter(e => e.type === 'out').forEach(e => { const k = e.category || 'بدون تصنيف'; byCat[k] = (byCat[k] || 0) + e.amount; });
  xlSave('حسابي_' + _tag(all), [
    { name: 'حركات حسابي', rows },
    { name: 'ملخص', rows: [
      { 'البند': 'الفترة', 'القيمة': _periodName(all) },
      { 'البند': 'إجمالي الإيداعات', 'القيمة': r2(sumBy(inP.filter(e => e.type === 'in'), e => e.amount)) },
      { 'البند': 'إجمالي المصروفات', 'القيمة': r2(sumBy(inP.filter(e => e.type === 'out'), e => e.amount)) },
      { 'البند': 'المتبقي معايا دلوقتي', 'القيمة': r2(run) },
    ] },
    { name: 'المصروفات حسب التصنيف', rows: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ 'التصنيف': k, 'الإجمالي': r2(v) })) },
  ]);
}
