/* ===== البضاعة: فواتير المورد بتتحسب هنا (تكلفة / بيع / ربح / مخزون) بعيد عن حساب الموردين ===== */

function purchaseInvoices(){
  const list = [];
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind === 'goods') list.push({ s, t });
  }));
  return list.sort((a, b) => new Date(b.t.date) - new Date(a.t.date));
}
function stockKey(productId, productName){
  if (productId) return 'id:' + productId;
  return 'n:' + norm(productName || '');
}
/* ---------- المخزون الشهري: كل شهر بيبدأ يعدّ من الصفر ---------- */
let stockMonth = null;   // 'YYYY-MM' الشهر المعروض
const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthOf = (iso) => localDateStr(iso).slice(0, 7);
const thisMonth = () => localDateStr(new Date()).slice(0, 7);
function monthLabel(m){ const [y, mm] = m.split('-'); return MONTH_NAMES[+mm - 1] + ' ' + y; }
function addMonths(m, n){ const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function numOrQty(v){ return (v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v)); }

// الأصناف المستبعدة من المخزون والأرباح (مثلًا «حساب قديم» اللي بيمثل أرصدة العملاء القديمة)
function isStockExcluded(productId, name){
  const p = productId ? state.products.find(x => x.id === productId) : null;
  if (p) return !!p.stockExcluded;
  return /حساب.*قديم/.test(norm(name || ''));
}
function emptyStockRow(name){
  return { name, boughtQty: 0, boughtCost: 0, soldQty: 0, soldRev: 0, lastSell: 0, buySale: 0 };
}
// كل مشتريات الصنف (لحساب متوسط التكلفة لو الشهر مفيهوش وارد)
function allPurchasesByKey(){
  const map = {};
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind !== 'goods') return;
    (t.items || []).forEach(it => {
      if (isStockExcluded(it.productId, it.productName)) return;
      (map[stockKey(it.productId, it.productName)] ||= []).push({ m: monthOf(t.date), qty: numOrQty(it.quantity), cost: numOrQty(it.subtotal != null ? it.subtotal : it.quantity * it.unitCost) });
    });
  }));
  return map;
}
function monthStock(m){
  const map = {};
  const row = (id, name) => {
    const k = stockKey(id, name);
    return (map[k] ||= Object.assign(emptyStockRow(name || 'صنف'), { key: k, productId: id || null }));
  };
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind !== 'goods' || monthOf(t.date) !== m) return;
    (t.items || []).forEach(it => {
      if (isStockExcluded(it.productId, it.productName)) return;
      const r = row(it.productId, it.productName);
      r.name = it.productName || r.name;
      r.boughtQty += numOrQty(it.quantity);
      r.boughtCost += numOrQty(it.subtotal != null ? it.subtotal : it.quantity * it.unitCost);
      r.buySale += numOrQty(it.quantity) * numOrQty(it.sellPrice);
      if (it.sellPrice) r.lastSell = it.sellPrice;
    });
  }));
  state.clients.forEach(c => c.invoices.forEach(inv => {
    if (monthOf(inv.date) !== m) return;
    inv.items.forEach(it => {
      if (isStockExcluded(it.productId, it.productName)) return;
      const r = row(it.productId, it.productName);
      r.name = it.productName || r.name;
      r.soldQty += numOrQty(it.quantity);
      r.soldRev += numOrQty(it.subtotal != null ? it.subtotal : it.quantity * it.unitPrice);
      if (it.unitPrice) r.lastSell = it.unitPrice;
    });
  }));
  const purchases = allPurchasesByKey();
  const rows = Object.values(map).map(r => {
    r.rawSoldQty = r2(r.soldQty); r.rawBoughtQty = r2(r.boughtQty);
    const adj = (state.stockAdjust || []).find(a => a.month === m && a.productKey === r.key);
    if (adj) {
      if (adj.soldQty !== null && adj.soldQty !== undefined) {
        if (r.soldQty > 0 && adj.soldQty < r.soldQty) r.soldRev = r.soldRev * (adj.soldQty / r.soldQty);   // الكمية الزايدة بإيرادها بتتشال من حساب المخزون
        r.soldQty = adj.soldQty;
      }
      if (adj.boughtQty !== null && adj.boughtQty !== undefined) {
        if (r.boughtQty > 0) { r.boughtCost = r.boughtCost * (adj.boughtQty / r.boughtQty); r.buySale = r.buySale * (adj.boughtQty / r.boughtQty); }
        r.boughtQty = adj.boughtQty;
      }
      r.adjusted = adj;
    }
    r.boughtQty = r2(r.boughtQty); r.boughtCost = r2(r.boughtCost); r.soldQty = r2(r.soldQty); r.soldRev = r2(r.soldRev); r.buySale = r2(r.buySale);
    if (r.boughtQty > 0) r.avgCost = r2(r.boughtCost / r.boughtQty);
    else {   // مفيش وارد الشهر ده: بنستخدم متوسط تكلفة مشتريات الصنف لحد الشهر ده
      const prev = (purchases[r.key] || []).filter(p => p.m <= m);
      const q = sumBy(prev, p => p.qty);
      r.avgCost = q > 0 ? r2(sumBy(prev, p => p.cost) / q) : 0;
    }
    r.noCost = r.soldQty > 0 && !r.avgCost;
    r.remain = r2(r.boughtQty - r.soldQty);
    r.cogs = r2(r.soldQty * r.avgCost);
    r.profit = r2(r.soldRev - r.cogs);
    r.stockValue = r2(Math.max(r.remain, 0) * r.avgCost);
    return r;
  }).filter(r => r.boughtQty || r.soldQty).sort((a, b) => b.boughtCost - a.boughtCost || a.name.localeCompare(b.name));
  const tot = {
    buyCost: r2(sumBy(rows, r => r.boughtCost)), buySale: r2(sumBy(rows, r => r.buySale)),
    soldRev: r2(sumBy(rows, r => r.soldRev)), cogs: r2(sumBy(rows, r => r.cogs)), profit: r2(sumBy(rows, r => r.profit)),
    remainVal: r2(sumBy(rows, r => r.stockValue)), remainQty: r2(sumBy(rows, r => Math.max(r.remain, 0))),
  };
  return { m, rows, tot };
}
function allStockMonths(){
  const set = new Set([thisMonth()]);
  state.suppliers.forEach(s => s.txns.forEach(t => { if (t.kind === 'goods') set.add(monthOf(t.date)); }));
  state.clients.forEach(c => c.invoices.forEach(i => set.add(monthOf(i.date))));
  (state.stockAdjust || []).forEach(a => set.add(a.month));
  return Array.from(set).sort().reverse();
}
const rangeInvoices = () => purchaseInvoices().filter(x => inRange(x.t.date));

/* ---------- تسوية / استبعاد ---------- */
function stockSetMonth(m){ stockMonth = m; renderStock(); }
function stockShift(n){ stockMonth = addMonths(stockMonth || thisMonth(), n); renderStock(); }
function adjustStock(enc){
  const key = decodeURIComponent(enc);
  const r = monthStock(stockMonth).rows.find(x => x.key === key); if (!r) return;
  const adj = r.adjusted;
  const fields = [
    { key: 'info', type: 'info', value: r.name + ' — شهر ' + monthLabel(stockMonth) + '\nالأرقام الأصلية من الفواتير: وارد ' + fmt(r.rawBoughtQty) + ' / مباع ' + fmt(r.rawSoldQty) + '\nلو غيّرت المباع لأقل، الكمية الزايدة بإيرادها بتتشال من المخزون والأرباح.' },
    { key: 'sold', label: 'المباع', type: 'num', value: r.soldQty },
    { key: 'bought', label: 'الوارد', type: 'num', value: r.boughtQty },
    { key: 'note', label: 'سبب التسوية (اختياري)', type: 'text', value: adj ? adj.note : '' },
  ];
  if (adj) fields.push({ key: 'reset', label: 'رجّع للأرقام الأصلية (إلغاء التسوية)', type: 'check', value: false });
  openEditModal({ title: 'تسوية المخزون', fields, onSave: async (v) => {
    const same = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.001;
    let sq = isNaN(v.sold) || same(v.sold, r.rawSoldQty) ? null : v.sold;
    let bq = isNaN(v.bought) || same(v.bought, r.rawBoughtQty) ? null : v.bought;
    if (v.reset) { sq = null; bq = null; }
    if (sq !== null && sq < 0 || bq !== null && bq < 0) { showToast('الكمية لازم تكون صفر أو أكتر'); throw new Error('qty'); }
    const json = await apiFetch('stock-adjust', 'POST', { month: stockMonth, productKey: key, soldQty: sq, boughtQty: bq, note: v.note });
    state.stockAdjust = (state.stockAdjust || []).filter(a => !(a.month === stockMonth && a.productKey === key));
    if (json.adjust) state.stockAdjust.push(json.adjust);
    renderStock(); showToast(json.adjust ? 'اتحفظت التسوية' : 'اتلغت التسوية');
  } });
}
async function setStockExcluded(productId, excluded){
  const p = state.products.find(x => x.id === productId); if (!p) return;
  if (excluded && !confirm('تستبعد «' + p.name + '» من المخزون والأرباح؟ (الفواتير والأرصدة مش هتتغير)')) return;
  try {
    await apiFetch('products/' + productId, 'PUT', { stockExcluded: !!excluded });
    p.stockExcluded = !!excluded;
    renderStock();
  } catch (e) {}
}

function stockInvoiceCard(s, t){
  const items = t.items || [];
  const c = invCalc(items);
  return `<div class="invoice-card">
    <div class="invoice-head"><span class="tag item">فاتورة بضاعة</span>
      <a class="lnk" onclick="openSupplier('${s.id}')">${esc(s.name)}</a>
      <span class="dt">${fmtDateTime(t.date)}</span></div>
    ${items.length ? `<div class="tbl-wrap"><table>
      <tr><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th><th>سعر البيع</th><th>الإجمالي</th></tr>
      ${items.map(it => `<tr><td>${esc(it.productName)}</td><td>${it.quantity}</td><td>${fmt(it.unitCost)} ج</td>
        <td>${fmt(it.sellPrice)} ج</td><td>${fmt(it.subtotal)} ج</td></tr>`).join('')}
    </table></div>
    <div class="inv-sum">
      <span>التكلفة: <b>${fmt(c.cost)} ج</b></span>
      <span>البيع المتوقع: <b>${fmt(c.sale)} ج</b></span>
      <span>الربح المتوقع: <b style="color:var(--${c.profit >= 0 ? 'credit' : 'debit'})">${fmt(c.profit)} ج</b> (${pctHtml(c.pct)})</span>
    </div>` : `<div style="font-size:13.5px;">${esc(t.note) || '—'} <b style="margin-right:8px;">${fmt(t.amount)} ج</b></div>`}
    ${items.length && t.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.note)}</div>` : ''}
    <div style="text-align:left;margin-top:4px;"><button class="edit-btn" onclick="editSupplierTxn('${s.id}','${t.id}')">تعديل ✎</button> <button class="del-btn" onclick="deleteSupplierTxn('${s.id}','${t.id}')">✕</button></div>
  </div>`;
}

function renderStock(){
  const app = document.getElementById('app');
  if (!stockMonth) stockMonth = thisMonth();
  const m = stockMonth, ms = monthStock(m), rows = ms.rows, tot = ms.tot;
  const months = allStockMonths();
  if (!months.includes(m)) months.push(m), months.sort().reverse();
  const summary = months.map(x => ({ m: x, t: monthStock(x).tot })).filter(x => x.t.buyCost || x.t.soldRev || x.m === m);
  const grand = r2(sumBy(summary, x => x.t.profit));
  const invPeriod = rangeInvoices();
  const excluded = state.products.filter(p => p.stockExcluded);
  const profCls = tot.profit >= 0 ? 'credit' : 'owe';

  app.innerHTML = `
  <header class="top"><h1>البضاعة</h1><p>المخزون والأرباح شهر بشهر — كل شهر بيبدأ يعدّ من الصفر. حساب الموردين منفصل (اللي علينا لهم).</p></header>
  ${navHtml('stock')}
  ${exportBar('exportStock')}
  <div class="monthbar">
    <button onclick="stockShift(-1)">→ الشهر اللي قبله</button>
    <select onchange="stockSetMonth(this.value)">${months.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${monthLabel(x)}</option>`).join('')}</select>
    <button onclick="stockShift(1)">الشهر اللي بعده ←</button>
    <button class="${m === thisMonth() ? 'on' : ''}" onclick="stockSetMonth(thisMonth())">الشهر ده</button>
  </div>
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">ربح شهر ${monthLabel(m)}</div>
        <div class="amount ${profCls}">${fmt(tot.profit)} ج</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">مبيعات ${fmt(tot.soldRev)} ج − تكلفة المباع ${fmt(tot.cogs)} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--debit)">${fmt(tot.buyCost)}</div><div class="l">تكلفة الوارد</div></div>
        <div><div class="n">${fmt(tot.remainVal)}</div><div class="l">قيمة المتبقي</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>المخزون — ${monthLabel(m)}</h2>
    <div class="stage-note" style="margin-top:0;">الوارد من فواتير المورد خلال الشهر − المباع للعملاء خلال الشهر. الربح = المبيعات − (المباع × متوسط الشراء). من ✎ تقدر تظبّط وارد أو مباع صنف في الشهر ده.</div>
    ${rows.length ? `<div class="tbl-wrap"><table>
      <tr><th>الصنف</th><th>وارد</th><th>مباع</th><th>متبقي</th><th>متوسط الشراء</th><th>تكلفة الوارد</th><th>المبيعات</th><th>ربح الشهر</th><th>قيمة المتبقي</th><th></th></tr>
      ${rows.map(r => `<tr>
        <td>${esc(r.name)}${r.adjusted ? ` <span class="chip" title="${esc(r.adjusted.note || 'تسوية يدوية')}" style="padding:1px 8px;font-size:11px;">متظبّط*</span>` : ''}${r.noCost ? ' <span class="chip" style="padding:1px 8px;font-size:11px;">بدون سعر شراء</span>' : ''}</td>
        <td>${fmt(r.boughtQty)}</td>
        <td>${fmt(r.soldQty)}</td>
        <td style="font-weight:700;color:var(--${r.remain < 0 ? 'debit' : (r.remain > 0 ? 'credit' : 'ink-soft')})">${fmt(r.remain)}</td>
        <td>${fmt(r.avgCost)} ج</td>
        <td>${fmt(r.boughtCost)} ج</td>
        <td>${fmt(r.soldRev)} ج</td>
        <td style="color:var(--${r.profit >= 0 ? 'credit' : 'debit'})">${fmt(r.profit)} ج</td>
        <td>${fmt(r.stockValue)} ج</td>
        <td style="white-space:nowrap;"><button class="edit-btn" onclick="adjustStock('${encodeURIComponent(r.key)}')" title="تسوية الوارد / المباع">✎</button>
          ${r.productId ? `<button class="edit-btn" onclick="setStockExcluded('${r.productId}', true)" title="استبعاد من المخزون والأرباح">استبعاد</button>` : ''}</td>
      </tr>`).join('')}
    </table></div>
    <div class="inv-sum">
      <span>ربح الشهر: <b style="color:var(--${tot.profit >= 0 ? 'credit' : 'debit'})">${fmt(tot.profit)} ج</b></span>
      <span>بيع متوقع للوارد: <b>${fmt(tot.buySale)} ج</b></span>
      <span>كمية متبقية: <b>${fmt(tot.remainQty)}</b></span>
    </div>` : '<div class="empty">مفيش وارد ولا مبيعات في الشهر ده</div>'}
  </div>

  <div class="card">
    <h2>الشهور</h2>
    <div class="tbl-wrap"><table>
      <tr><th>الشهر</th><th>تكلفة الوارد</th><th>المبيعات</th><th>تكلفة المباع</th><th>الربح</th><th>قيمة المتبقي</th><th></th></tr>
      ${summary.map(x => `<tr ${x.m === m ? 'style="background:#FFF3CF;"' : ''}>
        <td><b>${monthLabel(x.m)}</b></td><td>${fmt(x.t.buyCost)} ج</td><td>${fmt(x.t.soldRev)} ج</td><td>${fmt(x.t.cogs)} ج</td>
        <td style="font-weight:700;color:var(--${x.t.profit >= 0 ? 'credit' : 'debit'})">${fmt(x.t.profit)} ج</td><td>${fmt(x.t.remainVal)} ج</td>
        <td><button class="edit-btn" onclick="stockSetMonth('${x.m}')">عرض</button></td></tr>`).join('')}
    </table></div>
    <div class="inv-sum"><span>مجموع أرباح كل الشهور: <b style="color:var(--${grand >= 0 ? 'credit' : 'debit'})">${fmt(grand)} ج</b></span></div>
  </div>

  ${excluded.length ? `<div class="card"><h2>مستبعد من المخزون والأرباح</h2>
    <div class="stage-note" style="margin-top:0;">الأصناف دي فواتيرها وأرصدتها زي ما هي في حسابات العملاء، بس مش بتتحسب في المخزون ولا الأرباح.</div>
    ${excluded.map(p => `<div class="payment-line"><div><b>${esc(p.name)}</b></div><div><button class="edit-btn" onclick="setStockExcluded('${p.id}', false)">إرجاع للمخزون</button></div></div>`).join('')}</div>` : ''}

  <div class="card">
    <h2>فواتير البضاعة الواردة — ${rangeLabel()} (${invPeriod.length})</h2>
    ${invPeriod.length ? invPeriod.map(x => stockInvoiceCard(x.s, x.t)).join('') : '<div class="empty">مفيش فواتير بضاعة في الفترة دي</div>'}
  </div>`;
}
