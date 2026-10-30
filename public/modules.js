/* ===== تحصيل اليوم + الموردين + الخزنة + البحث + شريط الأسبوع ===== */
let currentSupplierId = null;
let cashType = 'out';          // out | in
let supDraft = [];             // أصناف فاتورة المورد قبل الحفظ
let supDraftNote = '';
let searchQ = '';
let prevView = 'home';

const pad2 = (n) => String(n).padStart(2, '0');
function localDateStr(d){ const x = new Date(d); return x.getFullYear() + '-' + pad2(x.getMonth()+1) + '-' + pad2(x.getDate()); }
const todayStr = () => localDateStr(new Date());
function addDays(str, n){ const d = new Date(str + 'T12:00:00'); d.setDate(d.getDate() + n); return localDateStr(d); }
function fmtTime(d){ return new Date(d).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}); }
function fmtDateTime(d){ return new Date(d).toLocaleDateString('ar-EG') + ' ' + fmtTime(d); }
function fmtDay(str, opts){ return new Date(str + 'T12:00:00').toLocaleDateString('ar-EG', opts || {weekday:'long', day:'numeric', month:'long'}); }
function sumBy(arr, f){ return arr.reduce((s, x) => s + f(x), 0); }
const r2 = (n) => Math.round((n || 0) * 100) / 100;

/* ---------- التحكم في التواريخ (شريط الأسبوع) ---------- */
let selDate = todayStr();   // اليوم المختار
let selMode = 'day';        // day = يوم واحد | week = الأسبوع كله | all = كل الفترات
let winEnd = todayStr();    // آخر يوم في الأسبوع الظاهر

function rangeBounds(){
  if (selMode === 'day') return [selDate, selDate];
  if (selMode === 'week') return [addDays(winEnd, -6), winEnd];
  return null;
}
function inRange(iso){ const b = rangeBounds(); if (!b) return true; const d = localDateStr(iso); return d >= b[0] && d <= b[1]; }
function rangeLabel(){
  if (selMode === 'all') return 'كل الفترات';
  if (selMode === 'week') { const b = rangeBounds(); return 'الأسبوع (' + fmtDay(b[0], {day:'numeric', month:'short'}) + ' → ' + fmtDay(b[1], {day:'numeric', month:'short'}) + ')'; }
  return selDate === todayStr() ? 'النهاردة' : fmtDay(selDate);
}
// التاريخ اللي هتتسجل بيه العمليات الجديدة (اليوم المختار لو اخترت يوم، وإلا النهاردة)
function dateForNew(){
  const day = selMode === 'day' ? selDate : todayStr();
  if (day === todayStr()) return new Date().toISOString();
  const t = new Date(), [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}

// أرقام صغيرة تحت كل يوم حسب الصفحة المفتوحة
function dayBadge(day){
  const onDay = (iso) => localDateStr(iso) === day;
  if (view === 'suppliers' || view === 'supplier') {
    const list = view === 'supplier' ? state.suppliers.filter(s => s.id === currentSupplierId) : state.suppliers;
    const v = sumBy(list, s => sumBy(s.txns.filter(t => t.kind === 'goods' && onDay(t.date)), t => t.amount));
    return v ? {text: fmt(v), cls: 'bad'} : null;
  }
  if (view === 'cash') {
    const v = sumBy(cashMovements().filter(m => onDay(m.date)), m => m.dir === 'in' ? m.amount : -m.amount);
    return v ? {text: (v > 0 ? '+' : '') + fmt(v), cls: v > 0 ? 'good' : 'bad'} : null;
  }
  const list = view === 'client' ? state.clients.filter(c => c.id === currentClientId) : state.clients;
  const v = sumBy(list, c => sumBy(c.payments.filter(p => onDay(p.date)), p => p.amount));
  return v ? {text: fmt(v), cls: 'good'} : null;
}
function dateStripInner(){
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(winEnd, -i));
  const note = view === 'suppliers' || view === 'supplier' ? 'بضاعة وردت' : (view === 'cash' ? 'صافي الحركة' : 'تحصيل');
  return `
    <div class="ds-row">
      <button class="ds-arrow" onclick="shiftWin(-7)" title="الأسبوع اللي قبله">→</button>
      <div class="ds-days">${days.map(d => {
        const b = dayBadge(d);
        const on = selMode === 'day' && selDate === d, inWk = selMode === 'week';
        return `<button class="ds-day ${on ? 'on' : ''} ${inWk ? 'inwk' : ''} ${d === todayStr() ? 'today' : ''}" onclick="setDay('${d}')">
          <span class="w">${fmtDay(d, {weekday:'short'})}</span><span class="n">${fmtDay(d, {day:'numeric'})}</span>
          <span class="b ${b ? b.cls : ''}">${b ? b.text : '·'}</span></button>`;
      }).join('')}</div>
      <button class="ds-arrow" onclick="shiftWin(7)" title="الأسبوع اللي بعده">←</button>
    </div>
    <div class="ds-ctrl">
      <input type="date" value="${selDate}" onchange="setDay(this.value)" title="اختار أي يوم">
      <button class="${selMode === 'day' && selDate === todayStr() ? 'on' : ''}" onclick="goToday()">النهاردة</button>
      <button class="${selMode === 'week' ? 'on' : ''}" onclick="setMode('week')">كل الأسبوع</button>
      <button class="${selMode === 'all' ? 'on' : ''}" onclick="setMode('all')">الكل</button>
      <span class="ds-hint">المعروض: <b>${rangeLabel()}</b> • (${note} تحت كل يوم) • العمليات الجديدة بتتسجل بتاريخ: <b>${fmtDay(localDateStr(dateForNew()), {weekday:'long', day:'numeric', month:'numeric'})}</b></span>
    </div>`;
}
function dateStripHtml(){ return '<div id="dateStrip" class="dstrip">' + dateStripInner() + '</div>'; }
function refreshStrip(){ const el = document.getElementById('dateStrip'); if (el) el.innerHTML = dateStripInner(); }
function afterDateChange(){
  refreshStrip();
  if (view === 'client' || view === 'search') return;
  if (view === 'supplier') { renderSupplierHistory(); return; }
  render();
}
function setDay(d){
  if (!d) return;
  selDate = d; selMode = 'day';
  if (d < addDays(winEnd, -6) || d > winEnd) winEnd = addDays(d, 3);
  afterDateChange();
}
function setMode(m){ selMode = m; afterDateChange(); }
function goToday(){ selDate = todayStr(); winEnd = todayStr(); selMode = 'day'; afterDateChange(); }
function shiftWin(n){ winEnd = addDays(winEnd, n); if (selMode === 'day') selDate = addDays(selDate, n); afterDateChange(); }

/* ---------- التنقل + البحث ---------- */
function navHtml(active){
  const tabs = [['home', '🏠 الرئيسية'], ['today', '💰 تحصيل اليوم'], ['suppliers', '🚚 الموردين'], ['cash', '🏦 الخزنة']];
  const activeKey = active === 'supplier' ? 'suppliers' : (active === 'client' ? 'home' : active);
  return '<nav class="nav">' + tabs.map(([k, label]) =>
    `<button class="${k === activeKey ? 'on' : ''}" onclick="goView('${k}')">${label}</button>`).join('') + '</nav>' +
    `<input id="gSearch" class="gsearch" type="search" placeholder="🔍 ابحث: عميل، مورد، صنف، ملاحظة، مبلغ..." value="${esc(searchQ)}" oninput="onSearchInput(this.value)">` +
    dateStripHtml();
}
function goView(v){
  view = v; currentClientId = null; currentSupplierId = null; staged = []; draftItems = []; searchQ = '';
  render();
}

const norm = (s) => (s == null ? '' : String(s)).toLowerCase()
  .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
  .replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

function runSearch(q){
  const n = norm(q).trim(); if (!n) return [];
  const has = (t) => norm(t).includes(n);
  const isNum = /^\d+(\.\d+)?$/.test(n);
  const amt = (a) => isNum && String(a).includes(n);
  const G = [];
  const add = (title, rows) => { if (rows.length) G.push({title, rows: rows.slice(0, 40)}); };

  add('👤 العملاء', state.clients.filter(c => has(c.name)).map(c => {
    const b = clientBalance(c);
    return {t: c.name, s: b > 0 ? 'مطلوب منه' : (b < 0 ? 'رصيد له' : 'الحساب متزن'), a: fmt(Math.abs(b)) + ' ج', go: `openClient('${c.id}')`};
  }));
  const inv = [];
  state.clients.forEach(c => c.invoices.forEach(i => {
    const names = i.items.map(x => x.productName + ' ×' + x.quantity).join('، ');
    if (has(names) || has(i.rawText) || amt(i.total)) inv.push({t: c.name + ' — فاتورة', s: names, a: fmt(i.total) + ' ج', d: i.date, go: `openClient('${c.id}')`});
  }));
  add('🧾 فواتير العملاء', inv);
  const pays = [];
  state.clients.forEach(c => c.payments.forEach(p => {
    if (has(p.note) || amt(p.amount)) pays.push({t: c.name + ' — دفعة', s: p.note, a: fmt(p.amount) + ' ج', d: p.date, go: `openClient('${c.id}')`});
  }));
  add('💵 دفعات العملاء', pays);

  add('🚚 الموردين', state.suppliers.filter(s => has(s.name)).map(s => {
    const b = supplierBalance(s);
    return {t: s.name, s: b > 0 ? 'مطلوب له' : (b < 0 ? 'رصيد لينا عنده' : 'الحساب متزن'), a: fmt(Math.abs(b)) + ' ج', go: `openSupplier('${s.id}')`};
  }));
  const goods = [], spay = [];
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind === 'goods') {
      const names = (t.items || []).map(x => x.productName + ' ×' + x.quantity).join('، ');
      if (has(names) || has(t.note) || amt(t.amount)) goods.push({t: s.name + ' — فاتورة بضاعة', s: names || t.note, a: fmt(t.amount) + ' ج', d: t.date, go: `openSupplier('${s.id}')`});
    } else if (has(t.note) || amt(t.amount)) spay.push({t: s.name + ' — دفعة', s: t.note, a: fmt(t.amount) + ' ج', d: t.date, go: `openSupplier('${s.id}')`});
  }));
  add('📦 فواتير الموردين', goods);
  add('💸 دفعات الموردين', spay);
  add('🏦 الخزنة', state.cash.filter(e => has(e.payee) || has(e.reason) || amt(e.amount)).map(e => ({
    t: (e.type === 'out' ? 'صرف: ' : 'إيداع: ') + (e.payee || '—'), s: e.reason, a: fmt(e.amount) + ' ج', d: e.date, go: `goView('cash')`})));
  add('🧀 الأصناف', state.products.filter(p => has(p.name) || amt(p.price)).map(p => ({t: p.name, s: 'سعر البيع', a: fmt(p.price) + ' ج', go: `goView('home')`})));
  return G;
}
function renderSearchResults(){
  const box = document.getElementById('searchResults'); if (!box) return;
  const G = runSearch(searchQ);
  box.innerHTML = G.length ? G.map(g => `
    <div class="card"><h2>${g.title} (${g.rows.length})</h2>
      <div class="client-list">${g.rows.map(r => `
        <div class="client-card" onclick="${r.go}">
          <div><div class="client-name">${esc(r.t)}</div>
            ${r.s ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:3px;">${esc(r.s)}</div>` : ''}
            ${r.d ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${fmtDateTime(r.d)}</div>` : ''}</div>
          <div class="amount even" style="font-size:15px;">${r.a}</div>
        </div>`).join('')}</div></div>`).join('') : '<div class="card"><div class="empty">مفيش نتايج للبحث ده</div></div>';
}
function renderSearch(){
  document.getElementById('app').innerHTML = `
    <header class="top"><h1>نتائج البحث</h1><p>بيدوّر في كل التواريخ: العملاء، الفواتير، الموردين، الخزنة، الأصناف</p></header>
    ${navHtml('search')}<div id="searchResults"></div>`;
  renderSearchResults();
}
function onSearchInput(v){
  searchQ = v;
  if (!v.trim()) { if (view === 'search') { view = prevView; render(); } return; }
  if (view !== 'search') {
    prevView = view; view = 'search'; renderSearch();
    const i = document.getElementById('gSearch'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
  } else renderSearchResults();
}

/* ---------- ملخص الفترة (للصفحة الرئيسية) ---------- */
function rangeSummaryHtml(){
  const coll = sumBy(state.clients, c => sumBy(c.payments.filter(p => inRange(p.date)), p => p.amount));
  const sales = sumBy(state.clients, c => sumBy(c.invoices.filter(i => inRange(i.date)), i => i.total));
  const sup = sumBy(state.suppliers, s => sumBy(s.txns.filter(t => t.kind === 'goods' && inRange(t.date)), t => t.amount));
  const out = sumBy(cashMovements().filter(m => m.dir === 'out' && inRange(m.date)), m => m.amount);
  return `<div class="card"><h2>ملخص: ${rangeLabel()}</h2>
    <div class="sum-grid">
      <div><div class="n" style="color:var(--credit)">${fmt(coll)}</div><div class="l">تحصيل</div></div>
      <div><div class="n" style="color:var(--debit)">${fmt(sales)}</div><div class="l">مبيعات</div></div>
      <div><div class="n">${fmt(sup)}</div><div class="l">بضاعة موردين</div></div>
      <div><div class="n" style="color:var(--debit)">${fmt(out)}</div><div class="l">خارج من الخزنة</div></div>
    </div></div>`;
}

/* ================= تحصيل اليوم ================= */
function renderToday(){
  const app = document.getElementById('app');
  const multi = selMode !== 'day';
  const pays = [];
  state.clients.forEach(c => c.payments.forEach(p => { if (inRange(p.date)) pays.push({client: c, p}); }));
  pays.sort((a, b) => new Date(b.p.date) - new Date(a.p.date));
  const total = sumBy(pays, x => x.p.amount);
  const sales = sumBy(state.clients, c => sumBy(c.invoices.filter(i => inRange(i.date)), i => i.total));
  const paidIds = new Set(pays.map(x => x.client.id));
  const notPaid = state.clients.filter(c => clientBalance(c) > 0 && !paidIds.has(c.id)).sort((a, b) => clientBalance(b) - clientBalance(a));

  app.innerHTML = `
  <header class="top"><h1>تحصيل اليوم</h1><p>كل الفلوس اللي اتحصّلت من العملاء — اختار اليوم من الشريط اللي تحت</p></header>
  ${navHtml('today')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">إجمالي التحصيل — ${rangeLabel()}</div>
        <div class="amount credit">${fmt(total)} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n">${pays.length}</div><div class="l">عدد الدفعات</div></div>
        <div><div class="n" style="color:var(--debit)">${fmt(sales)}</div><div class="l">مبيعات الفترة</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>تسجيل تحصيل سريع</h2>
    <div class="f-grid">
      <div><label>العميل</label>
        <select id="tClient">${state.clients.map(c => `<option value="${c.id}">${esc(c.name)} — ${fmt(Math.abs(clientBalance(c)))} ج ${clientBalance(c) > 0 ? 'عليه' : ''}</option>`).join('')}</select></div>
      <div><label>المبلغ</label><input type="number" id="tAmount" placeholder="ج" min="0"></div>
      <div><label>ملاحظة</label><input type="text" id="tNote" placeholder="اختياري"></div>
      <div><label>&nbsp;</label><button class="btn btn-credit" onclick="addQuickPayment()">تسجيل</button></div>
    </div>
    ${state.clients.length ? '' : '<div class="stage-note">ضيف عملاء الأول من الصفحة الرئيسية.</div>'}
  </div>

  <div class="card">
    <h2>الدفعات — ${rangeLabel()}</h2>
    ${pays.length ? pays.map(x => `
      <div class="payment-line">
        <div>
          <a class="lnk" onclick="openClient('${x.client.id}')">${esc(x.client.name)}</a>
          <span style="margin-right:8px;color:var(--ink-soft);font-size:12px;">${multi ? fmtDateTime(x.p.date) : fmtTime(x.p.date)}</span>
          ${x.p.note ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(x.p.note)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="amt-minus">${fmt(x.p.amount)} ج</span>
          <button class="del-btn" onclick="deleteTodayPayment('${x.client.id}','${x.p.id}')">✕</button>
        </div>
      </div>`).join('') : '<div class="empty">مفيش تحصيل في الفترة دي</div>'}
  </div>

  <div class="card">
    <h2>عليهم فلوس ولسه ما دفعوش في الفترة دي (${notPaid.length})</h2>
    ${notPaid.length ? `<div class="client-list">${notPaid.map(c => `
      <div class="client-card" onclick="openClient('${c.id}')">
        <div class="client-name">${esc(c.name)}</div>
        <div class="amount owe" style="font-size:15px;">${fmt(clientBalance(c))} ج</div>
      </div>`).join('')}</div>` : '<div class="empty">الكل دفع أو مفيش مديونيات 🎉</div>'}
  </div>`;
}
async function addQuickPayment(){
  const clientId = document.getElementById('tClient').value;
  const amount = parseFloat(document.getElementById('tAmount').value) || 0;
  const note = document.getElementById('tNote').value;
  if (!clientId) { showToast('اختار عميل'); return; }
  if (amount <= 0) { showToast('اكتب مبلغ صحيح'); return; }
  const client = getClient(clientId); if (!client) return;
  try {
    const json = await apiFetch('clients/' + clientId + '/payments', 'POST', { amount, note, date: dateForNew() });
    client.payments.push(json.payment);
    renderToday();
    showToast('اتسجل التحصيل');
  } catch (e) {}
}
async function deleteTodayPayment(clientId, payId){
  if (!confirm('حذف الدفعة دي؟')) return;
  const client = getClient(clientId); if (!client) return;
  try {
    await apiFetch('payments/' + payId, 'DELETE');
    client.payments = client.payments.filter(p => p.id !== payId);
    renderToday();
  } catch (e) {}
}

/* ================= الموردين ================= */
function getSupplier(id){ return state.suppliers.find(s => s.id === id); }
function supplierBalance(s){ // الموجب = احنا مديونين للمورد
  const goods = sumBy(s.txns.filter(t => t.kind === 'goods'), t => t.amount);
  const paid = sumBy(s.txns.filter(t => t.kind === 'payment'), t => t.amount);
  return r2(goods - paid);
}
// حساب تكلفة وبيع وربح فاتورة (نسبة الربح = الربح ÷ التكلفة)
function invCalc(items){
  const cost = sumBy(items, i => i.quantity * i.unitCost);
  const sale = sumBy(items, i => i.quantity * i.sellPrice);
  const profit = sale - cost;
  return {cost: r2(cost), sale: r2(sale), profit: r2(profit), pct: cost > 0 ? Math.round(profit / cost * 1000) / 10 : 0};
}
function pctHtml(pct){ return `<b style="color:var(--${pct >= 0 ? 'credit' : 'debit'})">${pct >= 0 ? '' : '-'}${Math.abs(pct).toLocaleString('ar-EG')}٪</b>`; }
function lastCostFor(productId){
  let best = null;
  state.suppliers.forEach(s => s.txns.forEach(t => (t.items || []).forEach(it => {
    if (it.productId === productId && (!best || new Date(t.date) > new Date(best.d))) best = {d: t.date, c: it.unitCost};
  })));
  return best ? best.c : '';
}
function supInvoiceCard(s, t, showSupplier){
  const items = t.items || [];
  const c = items.length ? invCalc(items) : null;
  return `<div class="invoice-card">
    <div class="invoice-head"><span class="tag item">${items.length ? 'فاتورة بضاعة' : 'بضاعة'}</span>
      ${showSupplier ? `<a class="lnk" onclick="openSupplier('${s.id}')">${esc(s.name)}</a>` : ''}
      <span class="dt">${fmtDateTime(t.date)}</span></div>
    ${items.length ? `<div class="tbl-wrap"><table>
      <tr><th>الصنف</th><th>الكمية</th><th>سعر الشراء</th><th>سعر البيع</th><th>إجمالي الشراء</th><th>الربح</th></tr>
      ${items.map(it => { const p = it.unitCost > 0 ? Math.round((it.sellPrice - it.unitCost) / it.unitCost * 1000) / 10 : 0;
        return `<tr><td>${esc(it.productName)}</td><td>${it.quantity}</td><td>${fmt(it.unitCost)}</td><td>${fmt(it.sellPrice)}</td><td>${fmt(it.subtotal)} ج</td><td>${pctHtml(p)}</td></tr>`; }).join('')}
    </table></div>
    <div class="inv-sum">
      <span>إجمالي الفاتورة: <b>${fmt(t.amount)} ج</b></span>
      <span>قيمة البيع: <b>${fmt(c.sale)} ج</b></span>
      <span>الربح: <b>${fmt(c.profit)} ج</b></span>
      <span>نسبة الربح: ${pctHtml(c.pct)}</span>
    </div>` : `<div style="font-size:13.5px;">${esc(t.note) || '—'} <b style="margin-right:8px;">${fmt(t.amount)} ج</b></div>`}
    ${items.length && t.note ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.note)}</div>` : ''}
    <div style="text-align:left;margin-top:4px;"><button class="del-btn" onclick="deleteSupplierTxn('${s.id}','${t.id}')">حذف ✕</button></div>
  </div>`;
}
function renderSuppliers(){
  const app = document.getElementById('app');
  const totalOwed = sumBy(state.suppliers, supplierBalance);
  const inv = [], pays = [];
  state.suppliers.forEach(s => s.txns.forEach(t => { if (inRange(t.date)) (t.kind === 'goods' ? inv : pays).push({s, t}); }));
  inv.sort((a, b) => new Date(b.t.date) - new Date(a.t.date));
  const goodsTotal = sumBy(inv, x => x.t.amount), paidTotal = sumBy(pays, x => x.t.amount);
  app.innerHTML = `
  <header class="top"><h1>حساب الموردين</h1><p>فواتير البضاعة اللي بتاخدها منهم والفلوس اللي بتدفعها لهم</p></header>
  ${navHtml('suppliers')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">إجمالي المطلوب للموردين</div>
        <div class="amount ${totalOwed > 0 ? 'owe' : (totalOwed < 0 ? 'credit' : 'even')}">${fmt(Math.abs(totalOwed))} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--debit)">${fmt(goodsTotal)}</div><div class="l">بضاعة — ${rangeLabel()}</div></div>
        <div><div class="n" style="color:var(--credit)">${fmt(paidTotal)}</div><div class="l">مدفوع — ${rangeLabel()}</div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>فواتير الموردين — ${rangeLabel()} (${inv.length})</h2>
    ${inv.length ? inv.map(x => supInvoiceCard(x.s, x.t, true)).join('') : '<div class="empty">مفيش فواتير في الفترة دي</div>'}
  </div>
  <div class="card">
    <h2>الموردين</h2>
    <div class="client-list">
      ${state.suppliers.length ? state.suppliers.map(s => {
        const b = supplierBalance(s);
        return `<div class="client-card" onclick="openSupplier('${s.id}')">
          <div class="client-name">${esc(s.name)}</div>
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="amount ${b > 0 ? 'owe' : (b < 0 ? 'credit' : 'even')}" style="font-size:15px;">${fmt(Math.abs(b))} ج ${b > 0 ? 'علينا' : (b < 0 ? 'لينا عنده' : '')}</div>
            <button class="icon-btn" onclick="event.stopPropagation();deleteSupplier('${s.id}')" title="حذف">✕</button>
          </div></div>`;
      }).join('') : '<div class="empty">لسه مفيش موردين، ضيف أول مورد تحت</div>'}
    </div>
    <div class="add-client-row">
      <input id="newSupplierName" placeholder="اسم مورد جديد" onkeydown="if(event.key==='Enter')addSupplier()">
      <button class="btn btn-cheese" onclick="addSupplier()">+ إضافة مورد</button>
    </div>
  </div>`;
}
async function addSupplier(){
  const input = document.getElementById('newSupplierName');
  const name = input.value.trim();
  if (!name) { showToast('اكتب اسم المورد الأول'); return; }
  try {
    const json = await apiFetch('suppliers', 'POST', { name });
    state.suppliers.push(json.supplier);
    renderSuppliers();
  } catch (e) {}
}
async function deleteSupplier(id){
  if (!confirm('هل تريد حذف المورد وكل سجله؟ لا يمكن التراجع.')) return;
  try {
    await apiFetch('suppliers/' + id, 'DELETE');
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    render();
  } catch (e) {}
}
function openSupplier(id){ currentSupplierId = id; view = 'supplier'; supDraft = []; supDraftNote = ''; searchQ = ''; render(); }
async function renameSupplier(id, value){
  const s = getSupplier(id); if (!s) return;
  const name = value.trim() || s.name;
  s.name = name;
  try { await apiFetch('suppliers/' + id, 'PUT', { name }); } catch (e) {}
}
function renderSupplierView(){
  const app = document.getElementById('app');
  const s = getSupplier(currentSupplierId);
  if (!s) { goView('suppliers'); return; }
  const bal = supplierBalance(s);
  const goods = sumBy(s.txns.filter(t => t.kind === 'goods'), t => t.amount);
  const paid = sumBy(s.txns.filter(t => t.kind === 'payment'), t => t.amount);
  app.innerHTML = `
  <div class="top-bar"><button class="back-btn" onclick="goView('suppliers')">→ كل الموردين</button></div>
  <header class="top" style="margin-top:6px;">
    <h1 style="font-size:26px;" contenteditable="true" onblur="renameSupplier('${s.id}', this.textContent)">${esc(s.name)}</h1>
  </header>
  ${navHtml('supplier')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">${bal > 0 ? 'مطلوب للمورد (علينا)' : (bal < 0 ? 'رصيد لينا عند المورد' : 'الحساب متزن')}</div>
        <div class="amount ${bal > 0 ? 'owe' : (bal < 0 ? 'credit' : 'even')}">${fmt(Math.abs(bal))} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--debit)">${fmt(goods)}</div><div class="l">إجمالي البضاعة</div></div>
        <div><div class="n" style="color:var(--credit)">${fmt(paid)}</div><div class="l">إجمالي المدفوع</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>فاتورة بضاعة جديدة من المورد</h2>
    ${state.products.length ? `
    <div class="f-grid">
      <div class="wide"><label>الصنف (من الأصناف اللي ضفتها في الرئيسية)</label>
        <select id="sdProduct" onchange="onSupProductChange()">${state.products.map(p => `<option value="${p.id}">${esc(p.name)} — بيع ${fmt(p.price)} ج</option>`).join('')}</select></div>
      <div><label>الكمية</label><input type="number" id="sdQty" value="1" min="0" step="any" oninput="updateSupPreview()"></div>
      <div><label>سعر الشراء للوحدة</label><input type="number" id="sdCost" placeholder="ج" min="0" step="any" oninput="updateSupPreview()"></div>
      <div><label>&nbsp;</label><button class="btn btn-outline" onclick="addSupDraft()">+ إضافة للفاتورة</button></div>
    </div>
    <div id="sdPreview" class="stage-note"></div>` : '<div class="empty">ضيف أصناف الأول من الصفحة الرئيسية (الأصناف والأسعار)</div>'}
    <div id="sdList"></div>
  </div>

  <div class="card">
    <h2>دفعت للمورد فلوس</h2>
    <div class="f-grid">
      <div><label>المبلغ</label><input type="number" id="pAmount" placeholder="ج" min="0"></div>
      <div class="wide"><label>ملاحظة</label><input type="text" id="pNote" placeholder="اختياري"></div>
      <div><label>&nbsp;</label><button class="btn btn-credit" onclick="addSupplierPayment()">تسجيل الدفعة</button></div>
    </div>
    <label class="chk"><input type="checkbox" id="pFromCash" checked> تتخصم من الخزنة</label>
  </div>

  <div class="card">
    <h2>سجل المورد</h2>
    <div id="supHistory"></div>
  </div>`;
  if (state.products.length) { onSupProductChange(); }
  renderSupDraft();
  renderSupplierHistory();
}
function onSupProductChange(){
  const sel = document.getElementById('sdProduct'); if (!sel) return;
  document.getElementById('sdCost').value = lastCostFor(sel.value);
  updateSupPreview();
}
function updateSupPreview(){
  const el = document.getElementById('sdPreview'); if (!el) return;
  const p = state.products.find(x => x.id === document.getElementById('sdProduct').value); if (!p) { el.innerHTML = ''; return; }
  const qty = parseFloat(document.getElementById('sdQty').value) || 0;
  const cost = parseFloat(document.getElementById('sdCost').value) || 0;
  if (!cost) { el.innerHTML = `سعر البيع: ${fmt(p.price)} ج — اكتب سعر الشراء علشان تشوف نسبة الربح.`; return; }
  const pct = Math.round((p.price - cost) / cost * 1000) / 10;
  el.innerHTML = `سعر البيع ${fmt(p.price)} ج • ربح الوحدة ${fmt(p.price - cost)} ج (${pctHtml(pct)}) • إجمالي السطر ${fmt(qty * cost)} ج`;
}
function addSupDraft(){
  const productId = document.getElementById('sdProduct').value;
  const quantity = parseFloat(document.getElementById('sdQty').value) || 0;
  const unitCost = parseFloat(document.getElementById('sdCost').value) || 0;
  const p = state.products.find(x => x.id === productId);
  if (!p) { showToast('اختار صنف'); return; }
  if (quantity <= 0) { showToast('اكتب الكمية'); return; }
  if (unitCost <= 0) { showToast('اكتب سعر الشراء'); return; }
  supDraft.push({id: newId(), productId, productName: p.name, quantity, unitCost, sellPrice: p.price});
  document.getElementById('sdQty').value = 1;
  renderSupDraft();
}
function removeSupDraft(id){ supDraft = supDraft.filter(d => d.id !== id); renderSupDraft(); }
function renderSupDraft(){
  const area = document.getElementById('sdList'); if (!area) return;
  if (!supDraft.length) { area.innerHTML = ''; return; }
  const c = invCalc(supDraft);
  area.innerHTML = `
    <div class="tbl-wrap"><table>
      <tr><th>الصنف</th><th>الكمية</th><th>سعر الشراء</th><th>سعر البيع</th><th>الإجمالي</th><th>الربح</th><th></th></tr>
      ${supDraft.map(d => { const p = Math.round((d.sellPrice - d.unitCost) / d.unitCost * 1000) / 10;
        return `<tr><td>${esc(d.productName)}</td><td>${d.quantity}</td><td>${fmt(d.unitCost)}</td><td>${fmt(d.sellPrice)}</td>
        <td>${fmt(d.quantity * d.unitCost)} ج</td><td>${pctHtml(p)}</td><td><button class="del-btn" onclick="removeSupDraft('${d.id}')">✕</button></td></tr>`; }).join('')}
    </table></div>
    <div class="inv-sum">
      <span>إجمالي الفاتورة: <b>${fmt(c.cost)} ج</b></span>
      <span>قيمة البيع: <b>${fmt(c.sale)} ج</b></span>
      <span>الربح: <b>${fmt(c.profit)} ج</b></span>
      <span>نسبة الربح: ${pctHtml(c.pct)}</span>
    </div>
    <div class="f-grid" style="margin-top:10px;">
      <div class="wide"><label>ملاحظة / رقم فاتورة المورد (اختياري)</label><input type="text" value="${esc(supDraftNote)}" oninput="supDraftNote=this.value"></div>
      <div><label>&nbsp;</label><button class="btn btn-cheese" onclick="saveSupInvoice()">حفظ الفاتورة</button></div>
    </div>`;
}
async function saveSupInvoice(){
  const s = getSupplier(currentSupplierId); if (!s) return;
  if (!supDraft.length) { showToast('ضيف صنف الأول'); return; }
  try {
    const items = supDraft.map(d => ({productId: d.productId, quantity: d.quantity, unitCost: d.unitCost}));
    const json = await apiFetch('suppliers/' + s.id + '/txns', 'POST', { kind: 'goods', items, note: supDraftNote, date: dateForNew() });
    s.txns.push(json.txn);
    supDraft = []; supDraftNote = '';
    renderSupplierView();
    showToast('اتحفظت الفاتورة');
  } catch (e) {}
}
async function addSupplierPayment(){
  const s = getSupplier(currentSupplierId); if (!s) return;
  const amount = parseFloat(document.getElementById('pAmount').value) || 0;
  const note = document.getElementById('pNote').value;
  if (amount <= 0) { showToast('اكتب مبلغ صحيح'); return; }
  const fromCash = document.getElementById('pFromCash').checked;
  try {
    const json = await apiFetch('suppliers/' + s.id + '/txns', 'POST', { kind: 'payment', amount, note, fromCash, date: dateForNew() });
    s.txns.push(json.txn);
    renderSupplierView();
    showToast('اتسجلت الدفعة');
  } catch (e) {}
}
function renderSupplierHistory(){
  const box = document.getElementById('supHistory'); if (!box) return;
  const s = getSupplier(currentSupplierId); if (!s) return;
  const txns = s.txns.filter(t => inRange(t.date)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const goodsInRange = txns.filter(t => t.kind === 'goods');
  const c = invCalc(goodsInRange.flatMap(t => t.items || []));
  box.innerHTML = `
    <div class="stage-note" style="margin:0 0 10px;">المعروض: <b>${rangeLabel()}</b> — لو عايز كل السجل اضغط <a class="lnk" onclick="setMode('all')">الكل</a>
      ${goodsInRange.some(t => t.items) ? ` • ربح فواتير الفترة: ${fmt(c.profit)} ج (${pctHtml(c.pct)})` : ''}</div>
    ${txns.length ? txns.map(t => t.kind === 'goods' ? supInvoiceCard(s, t, false) : `
      <div class="payment-line">
        <div><span class="tag payment">دفعة</span> <span style="margin-right:8px;color:var(--ink-soft);font-size:12px;">${fmtDateTime(t.date)}</span>
          <div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.note)}${t.fromCash ? '' : ' (من برّه الخزنة)'}</div></div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="amt-minus">- ${fmt(t.amount)} ج</span>
          <button class="del-btn" onclick="deleteSupplierTxn('${s.id}','${t.id}')">✕</button></div>
      </div>`).join('') : '<div class="empty">مفيش حاجة في الفترة دي</div>'}`;
}
async function deleteSupplierTxn(supplierId, id){
  if (!confirm('حذف العملية دي؟')) return;
  const s = getSupplier(supplierId); if (!s) return;
  try {
    await apiFetch('supplier-txns/' + id, 'DELETE');
    s.txns = s.txns.filter(t => t.id !== id);
    view === 'supplier' ? renderSupplierView() : render();
  } catch (e) {}
}

/* ================= الخزنة ================= */
function cashMovements(){
  const list = [];
  state.clients.forEach(c => c.payments.forEach(p => list.push({
    id: p.id, date: p.date, dir: 'in', amount: p.amount, src: 'client', label: 'تحصيل من ' + c.name, detail: p.note || '' })));
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind === 'payment' && t.fromCash) list.push({
      id: t.id, date: t.date, dir: 'out', amount: t.amount, src: 'supplier', label: 'دفعة للمورد ' + s.name, detail: t.note || '' });
  }));
  state.cash.forEach(e => list.push({
    id: e.id, date: e.date, dir: e.type, amount: e.amount, src: 'manual',
    label: e.payee || (e.type === 'out' ? 'صرف' : 'إيداع'), detail: e.reason || '' }));
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}
function renderCash(){
  const app = document.getElementById('app');
  const all = cashMovements();
  const balance = sumBy(all, m => m.dir === 'in' ? m.amount : -m.amount);
  const rows = all.filter(m => inRange(m.date));
  const totIn = sumBy(rows.filter(m => m.dir === 'in'), m => m.amount);
  const totOut = sumBy(rows.filter(m => m.dir === 'out'), m => m.amount);
  const byReason = {};
  rows.filter(m => m.src === 'manual' && m.dir === 'out').forEach(m => { const k = (m.detail || 'بدون سبب').trim(); byReason[k] = (byReason[k] || 0) + m.amount; });
  const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

  app.innerHTML = `
  <header class="top"><h1>الخزنة</h1><p>الفلوس اللي معاك — الداخل من التحصيل والخارج للموردين والمصروفات</p></header>
  ${navHtml('cash')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">رصيد الخزنة الحالي</div>
        <div class="amount ${balance > 0 ? 'credit' : (balance < 0 ? 'owe' : 'even')}">${balance < 0 ? '-' : ''}${fmt(Math.abs(balance))} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--credit)">${fmt(totIn)}</div><div class="l">داخل — ${rangeLabel()}</div></div>
        <div><div class="n" style="color:var(--debit)">${fmt(totOut)}</div><div class="l">خارج — ${rangeLabel()}</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>تسجيل حركة في الخزنة</h2>
    <div class="seg">
      <button class="${cashType === 'out' ? 'on out' : ''}" onclick="cashType='out';renderCash()">⬆️ صرف (خارج)</button>
      <button class="${cashType === 'in' ? 'on in' : ''}" onclick="cashType='in';renderCash()">⬇️ إيداع (داخل)</button>
    </div>
    <div class="f-grid">
      <div><label>المبلغ</label><input type="number" id="cAmount" placeholder="ج" min="0"></div>
      <div><label>${cashType === 'out' ? 'صرفتها فين / لمين' : 'جت من مين'}</label><input type="text" id="cPayee" placeholder="${cashType === 'out' ? 'مثال: محطة بنزين، عامل، صاحب المحل' : 'مثال: رصيد افتتاحي'}"></div>
      <div><label>${cashType === 'out' ? 'على إيه / السبب' : 'السبب'}</label><input type="text" id="cReason" list="reasonList" placeholder="مثال: بنزين، إيجار، عمالة"></div>
      <div><label>&nbsp;</label><button class="btn ${cashType === 'out' ? 'btn-cheese' : 'btn-credit'}" onclick="addCashEntry()">تسجيل</button></div>
    </div>
    <datalist id="reasonList">${['بنزين', 'إيجار', 'عمالة', 'كهربا', 'نقل', 'أكل', 'صيانة', 'سلفة'].map(r => `<option value="${r}">`).join('')}</datalist>
    <div class="stage-note">التحصيل من العملاء بيدخل الخزنة لوحده، ودفعات الموردين (لو علّمت "تتخصم من الخزنة") بتخرج لوحدها. هنا بتسجل باقي المصروفات.</div>
  </div>

  <div class="card">
    <h2>الحركات — ${rangeLabel()}</h2>
    ${reasons.length ? `<div class="chips">${reasons.map(([r, v]) => `<span class="chip">${esc(r)}: ${fmt(v)} ج</span>`).join('')}</div>` : ''}
    ${rows.length ? rows.map(m => `
      <div class="payment-line" style="background:${m.dir === 'in' ? '#F5FAF7' : '#FBF3EF'};">
        <div>
          <span class="tag ${m.dir === 'in' ? 'payment' : 'item'}">${m.dir === 'in' ? 'داخل' : 'خارج'}</span>
          <b style="margin-right:6px;">${esc(m.label)}</b>
          <span style="color:var(--ink-soft);font-size:12px;">${fmtDateTime(m.date)}${m.src !== 'manual' ? ' • تلقائي' : ''}</span>
          ${m.detail ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(m.detail)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="${m.dir === 'in' ? 'amt-minus' : 'amt-plus'}">${m.dir === 'in' ? '+' : '-'} ${fmt(m.amount)} ج</span>
          ${m.src === 'manual' ? `<button class="del-btn" onclick="deleteCashEntry('${m.id}')">✕</button>` : ''}
        </div>
      </div>`).join('') : '<div class="empty">مفيش حركات في الفترة دي</div>'}
  </div>`;
}
async function addCashEntry(){
  const amount = parseFloat(document.getElementById('cAmount').value) || 0;
  const payee = document.getElementById('cPayee').value;
  const reason = document.getElementById('cReason').value;
  if (amount <= 0) { showToast('اكتب مبلغ صحيح'); return; }
  try {
    const json = await apiFetch('cash', 'POST', { type: cashType, amount, payee, reason, date: dateForNew() });
    state.cash.push(json.entry);
    renderCash();
    showToast('اتسجلت الحركة');
  } catch (e) {}
}
async function deleteCashEntry(id){
  if (!confirm('حذف الحركة دي؟')) return;
  try {
    await apiFetch('cash/' + id, 'DELETE');
    state.cash = state.cash.filter(e => e.id !== id);
    renderCash();
  } catch (e) {}
}
