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
function emptyStockRow(name){
  return { name, boughtQty: 0, boughtCost: 0, soldQty: 0, soldRev: 0, remain: 0, avgCost: 0, lastSell: 0 };
}
function stockByProduct(){
  const map = {};
  const row = (id, name) => {
    const k = stockKey(id, name);
    return (map[k] ||= emptyStockRow(name || 'صنف'));
  };
  state.suppliers.forEach(s => s.txns.forEach(t => {
    if (t.kind !== 'goods') return;
    (t.items || []).forEach(it => {
      const r = row(it.productId, it.productName);
      r.name = it.productName || r.name;
      r.boughtQty += numOrQty(it.quantity);
      r.boughtCost += numOrQty(it.subtotal != null ? it.subtotal : it.quantity * it.unitCost);
      if (it.sellPrice) r.lastSell = it.sellPrice;
    });
  }));
  state.clients.forEach(c => c.invoices.forEach(inv => inv.items.forEach(it => {
    const r = row(it.productId, it.productName);
    r.name = it.productName || r.name;
    r.soldQty += numOrQty(it.quantity);
    r.soldRev += numOrQty(it.subtotal != null ? it.subtotal : it.quantity * it.unitPrice);
    if (it.unitPrice) r.lastSell = it.unitPrice;
  })));
  state.products.forEach(p => {
    const r = row(p.id, p.name);
    r.name = p.name;
    if (p.price) r.lastSell = p.price;
  });
  Object.values(map).forEach(r => {
    r.boughtQty = r2(r.boughtQty);
    r.boughtCost = r2(r.boughtCost);
    r.soldQty = r2(r.soldQty);
    r.soldRev = r2(r.soldRev);
    r.avgCost = r.boughtQty > 0 ? r2(r.boughtCost / r.boughtQty) : 0;
    r.remain = r2(r.boughtQty - r.soldQty);
    r.cogs = r2(r.soldQty * r.avgCost);
    r.profit = r2(r.soldRev - r.cogs);
    r.stockValue = r2(Math.max(r.remain, 0) * r.avgCost);
    r.potential = r2(Math.max(r.remain, 0) * ((r.lastSell || 0) - r.avgCost));
  });
  return Object.values(map).filter(r => r.boughtQty || r.soldQty).sort((a, b) => b.boughtCost - a.boughtCost);
}
function numOrQty(v){ return (v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v)); }

function periodStockTotals(){
  const inv = purchaseInvoices().filter(x => inRange(x.t.date));
  const buyCost = r2(sumBy(inv, x => x.t.amount));
  const buySale = r2(sumBy(inv, x => invCalc(x.t.items || []).sale));
  const buyProfit = r2(buySale - buyCost);
  let soldRev = 0, soldQty = 0;
  state.clients.forEach(c => c.invoices.filter(i => inRange(i.date)).forEach(invc => {
    soldRev += invc.total;
    soldQty += sumBy(invc.items, it => it.quantity);
  }));
  const rows = stockByProduct();
  const remainVal = r2(sumBy(rows, r => r.stockValue));
  const remainQty = r2(sumBy(rows, r => Math.max(r.remain, 0)));
  const realized = r2(sumBy(rows, r => r.profit));
  return { inv, buyCost, buySale, buyProfit, soldRev: r2(soldRev), soldQty: r2(soldQty), remainVal, remainQty, realized, rows };
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
  const tot = periodStockTotals();
  const invPeriod = tot.inv;
  const rows = tot.rows;
  app.innerHTML = `
  <header class="top"><h1>البضاعة</h1><p>كل فاتورة بضاعة من المورد بتتحسب هنا: التكلفة، البيع المتوقع، الربح، والمخزون. حساب الموردين منفصل (اللي علينا لهم).</p></header>
  ${navHtml('stock')}
  ${exportBar('exportStock')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">تكلفة البضاعة الواردة — ${rangeLabel()}</div>
        <div class="amount owe">${fmt(tot.buyCost)} ج</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">بيع متوقع ${fmt(tot.buySale)} ج • ربح متوقع على الوارد ${fmt(tot.buyProfit)} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--credit)">${fmt(tot.soldRev)}</div><div class="l">مبيعات العملاء — ${rangeLabel()}</div></div>
        <div><div class="n">${fmt(tot.remainVal)}</div><div class="l">قيمة المخزون المتبقي</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>المخزون حسب الصنف</h2>
    <div class="stage-note" style="margin-top:0;">الوارد من فواتير المورد − المباع للعملاء. الربح المحقق = المبيعات − متوسط تكلفة الشراء.</div>
    ${rows.length ? `<div class="tbl-wrap"><table>
      <tr><th>الصنف</th><th>وارد</th><th>مباع</th><th>متبقي</th><th>متوسط الشراء</th><th>تكلفة الوارد</th><th>المبيعات</th><th>ربح محقق</th><th>قيمة المتبقي</th></tr>
      ${rows.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td>${fmt(r.boughtQty)}</td>
        <td>${fmt(r.soldQty)}</td>
        <td style="font-weight:700;color:var(--${r.remain < 0 ? 'debit' : (r.remain > 0 ? 'credit' : 'ink-soft')})">${fmt(r.remain)}</td>
        <td>${fmt(r.avgCost)} ج</td>
        <td>${fmt(r.boughtCost)} ج</td>
        <td>${fmt(r.soldRev)} ج</td>
        <td style="color:var(--${r.profit >= 0 ? 'credit' : 'debit'})">${fmt(r.profit)} ج</td>
        <td>${fmt(r.stockValue)} ج</td>
      </tr>`).join('')}
    </table></div>
    <div class="inv-sum">
      <span>ربح محقق على كل المبيعات: <b style="color:var(--credit)">${fmt(tot.realized)} ج</b></span>
      <span>كمية متبقية: <b>${fmt(tot.remainQty)}</b></span>
    </div>` : '<div class="empty">لسه مفيش وارد بضاعة. سجّل فاتورة من صفحة المورد.</div>'}
  </div>

  <div class="card">
    <h2>فواتير البضاعة الواردة — ${rangeLabel()} (${invPeriod.length})</h2>
    ${invPeriod.length ? invPeriod.map(x => stockInvoiceCard(x.s, x.t)).join('') : '<div class="empty">مفيش فواتير بضاعة في الفترة دي</div>'}
  </div>`;
}
