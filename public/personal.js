/* ===== حسابي الشخصي: منفصل تمامًا عن الخزنة وحسابات الشغل (وفيه خانة السلف) ===== */
let personalType = 'out';   // out | in
let loanManual = false;     // زرار "💳 سلفة" اتضغط يدوي
let loanChoice = null;      // null = تلقائي | 'borrow' | 'repay' | 'none'
let loanOpen = {};          // الجهات اللي سجلها مفتوح

/* ---- أثر الحركة على رصيد حسابي: السداد من برّه الحساب مش بيأثر على الرصيد ---- */
const pEff = (e) => (e.offAccount ? 0 : (e.type === 'in' ? e.amount : -e.amount));
const pIn = (e) => (!e.offAccount && e.type === 'in' ? e.amount : 0);
const pOut = (e) => (!e.offAccount && e.type === 'out' ? e.amount : 0);

/* ---- السلف ---- */
const LOAN_RE = /سلف|استلف|استلاف|تسليف/;      // سلفة / سلفه / سلف / استلفت ...
const lenderKey = (n) => norm(n).trim();
function loansSummary(){
  const m = {};
  state.personal.filter(e => e.loan).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(e => {
    const k = lenderKey(e.party) || '—';
    const o = (m[k] ||= { key: k, name: (e.party || '').trim() || '—', borrowed: 0, repaid: 0, events: [] });
    if (e.loan === 'borrow') o.borrowed += e.amount; else o.repaid += e.amount;
    o.events.push(e);
  });
  return Object.values(m).map(o => ({ ...o, remaining: r2(o.borrowed - o.repaid) })).sort((a, b) => b.remaining - a.remaining);
}
const loansTotal = () => r2(sumBy(loansSummary(), l => (l.remaining > 0 ? l.remaining : 0)));
function dayToIso(day){
  if (!day || day === todayStr()) return new Date().toISOString();
  const t = new Date(), [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}

function personalFiltered(){
  const n = norm(searchQ).trim();
  return state.personal.filter(e => inRange(e.date)).filter(e => {
    if (!n) return true;
    return norm(e.party).includes(n) || norm(e.category).includes(n) || norm(e.note).includes(n) ||
           (e.loan && norm('سلفة').includes(n)) || (/^\d+(\.\d+)?$/.test(n) && String(e.amount).includes(n));
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* ---- كارت السلف ---- */
function loansCardHtml(){
  const L = loansSummary();
  const total = loansTotal();
  if (!L.length) return `<div class="card"><h2>💳 السلف</h2>
    <div class="empty" style="padding:8px 0;">لسه مفيش سلف. لما تسجّل إيداع وتكتب «سلفة» في الجهة أو التصنيف أو الملاحظات، هتتسجل هنا لوحدها وتعرف عليك قد إيه ولمين.</div></div>`;
  const row = (l) => {
    const done = l.remaining <= 0.004, enc = encodeURIComponent(l.key), open = !!loanOpen[l.key];
    let run = 0;
    return `<div class="loan-item ${done ? 'done' : ''}">
      <div class="loan-head">
        <div><b>${esc(l.name)}</b>
          <div class="loan-sub">استلفت ${fmt(l.borrowed)} ج • سددت ${fmt(l.repaid)} ج</div></div>
        <div class="loan-act">
          <span class="amount ${done ? 'credit' : 'owe'}" style="font-size:16px;">${done ? (l.remaining < -0.004 ? 'زيادة ' + fmt(-l.remaining) : 'اتسدّدت ✓') : 'عليك ' + fmt(l.remaining) + ' ج'}</span>
          ${done ? '' : `<button class="btn btn-credit btn-sm" onclick="repayLoan('${enc}')">سداد</button>`}
          <button class="edit-btn" onclick="toggleLoan('${enc}')">${open ? 'إخفاء السجل' : 'السجل'}</button>
        </div>
      </div>
      ${open ? `<div class="loan-events">${l.events.map(e => {
        run += e.loan === 'borrow' ? e.amount : -e.amount;
        return `<div class="payment-line" style="background:${e.loan === 'borrow' ? '#FBF3EF' : '#F5FAF7'};">
          <div><span class="tag ${e.loan === 'borrow' ? 'item' : 'payment'}">${e.loan === 'borrow' ? 'استلفت' : 'سدّدت'}</span>
            <span style="color:var(--ink-soft);font-size:12px;margin-right:6px;">${fmtDateTime(e.date)}</span>
            ${e.offAccount ? '<span class="chip" style="padding:2px 9px;font-size:11.5px;">من برّه حسابي</span>' : ''}
            <span style="font-size:12px;color:var(--ink-soft);margin-right:6px;">المتبقي بعدها: ${fmt(r2(run))} ج</span>
            ${e.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">📝 ${esc(e.note)}</div>` : ''}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="${e.loan === 'borrow' ? 'amt-plus' : 'amt-minus'}">${e.loan === 'borrow' ? '+' : '-'} ${fmt(e.amount)} ج</span>
            <button class="edit-btn" onclick="editPersonalEntry('${e.id}')" title="تعديل">✎</button>
            <button class="del-btn" onclick="deletePersonalEntry('${e.id}')">✕</button>
          </div></div>`; }).join('')}</div>` : ''}
    </div>`;
  };
  return `<div class="card">
    <div class="top-bar"><h2 style="border:none;margin:0;">💳 السلف</h2>
      <div style="text-align:left;"><div style="font-size:11.5px;color:var(--ink-soft);">إجمالي اللي عليك</div>
        <div class="amount ${total > 0 ? 'owe' : 'credit'}" style="font-size:22px;">${fmt(total)} ج</div></div></div>
    ${L.map(row).join('')}
    <div class="stage-note">السلفة بتفضل ثابتة لحد ما تسدّدها بزرار «سداد» (أو تسجّل سداد وانت بتكتب «سلفة»).</div>
  </div>`;
}
function toggleLoan(enc){ const k = decodeURIComponent(enc); loanOpen[k] = !loanOpen[k]; renderPersonal(); }

function repayLoan(enc){
  const k = decodeURIComponent(enc);
  const l = loansSummary().find(x => x.key === k); if (!l) return;
  openEditModal({ title: 'سداد سلفة — ' + l.name, fields: [
    { key: 'info', type: 'info', value: 'المتبقي عليك لـ ' + l.name + ': ' + fmt(l.remaining) + ' ج' },
    { key: 'amount', label: 'المبلغ اللي سدّدته', type: 'num', value: l.remaining > 0 ? l.remaining : '' },
    { key: 'note', label: 'ملاحظة (اختياري)', type: 'text', value: '' },
    { key: 'day', label: 'تاريخ السداد', type: 'date', value: localDateStr(dateForNew()) },
    { key: 'fromAcct', label: 'تتخصم من رصيد حسابي (لو دفعتها من جيبك برّه الحساب شيل العلامة)', type: 'check', value: true },
  ], onSave: async (v) => {
    if (!(v.amount > 0)) { showToast('اكتب مبلغ صحيح'); throw new Error('amount'); }
    const json = await apiFetch('personal', 'POST', { type: 'out', loan: 'repay', amount: v.amount, party: l.name, category: 'سداد سلفة', note: v.note, offAccount: !v.fromAcct, date: dayToIso(v.day) });
    state.personal.push(json.entry);
    renderPersonal();
    showToast('اتسجّل السداد — لسه عليك ' + fmt(loansTotal()) + ' ج');
  } });
}

/* ---- لافتة السلفة في الفورم (بتظهر لما تكتب سلفة / سلفه / سلف) ---- */
function loanActive(){
  if (loanManual) return true;
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  return LOAN_RE.test(norm(g('pvParty') + ' ' + g('pvCategory') + ' ' + g('pvNote')));
}
function loanAuto(){
  if (loanManual || personalType === 'in') return 'borrow';
  const k = lenderKey((document.getElementById('pvParty') || {}).value || '');
  return k && loansSummary().some(l => l.key === k && l.remaining > 0.004) ? 'repay' : 'none';
}
function updateLoanBox(){
  const box = document.getElementById('loanBox'); if (!box) return;
  if (!loanActive()) { box.innerHTML = ''; return; }
  const role = loanChoice || loanAuto();
  const party = ((document.getElementById('pvParty') || {}).value || '').trim();
  const l = loansSummary().find(x => x.key === lenderKey(party));
  const opt = (v, text) => `<label class="lb-opt ${role === v ? 'on' : ''}"><input type="radio" name="loanRole" value="${v}" ${role === v ? 'checked' : ''} onchange="loanChoice=this.value;updateLoanBox()"> ${text}</label>`;
  const prevFromAcct = document.getElementById('loanFromAcct');
  const fromAcct = prevFromAcct ? prevFromAcct.checked : true;
  box.innerHTML = `<div class="loanbox">
    <div class="lb-title">💳 دي سلفة — هتتسجل في خانة «السلف» ${role === 'none' ? '(اخترت إنها حركة عادية)' : ''}</div>
    <div class="lb-opts">
      ${opt('borrow', `استلفت (فلوس دخلتلي) من <b>${esc(party) || '…'}</b>`)}
      ${opt('repay', `سدّدت سلفة (فلوس خرجت) لـ <b>${esc(party) || '…'}</b>`)}
      ${opt('none', 'مش سلفة — سجّلها حركة عادية')}
    </div>
    ${role === 'repay' ? `<label class="chk"><input type="checkbox" id="loanFromAcct" ${fromAcct ? 'checked' : ''}> تتخصم من رصيد حسابي (لو دفعتها من جيبك برّه الحساب شيل العلامة)</label>` : ''}
    ${l ? `<div class="stage-note">عليك لـ ${esc(l.name)} دلوقتي: <b>${fmt(Math.max(l.remaining, 0))} ج</b></div>` : (role === 'repay' && party ? '<div class="stage-note">مفيش سلفة مسجلة بالاسم ده.</div>' : '')}
  </div>`;
}

function renderPersonal(){
  const app = document.getElementById('app');
  const all = state.personal;
  const balance = sumBy(all, pEff);
  const totalIn = sumBy(all, pIn);
  const totalOut = sumBy(all, pOut);
  const inRng = all.filter(e => inRange(e.date));
  const rIn = sumBy(inRng, pIn);
  const rOut = sumBy(inRng, pOut);
  const isOut = personalType === 'out';
  const debt = loansTotal();

  app.innerHTML = `
  <header class="top"><h1>حسابي الشخصي</h1><p>فلوسي أنا — منفصلة تمامًا عن الخزنة وحسابات الشغل</p></header>
  ${navHtml('personal')}
  ${exportBar('exportPersonal')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">المتبقي معايا دلوقتي</div>
        <div class="amount ${balance > 0 ? 'credit' : (balance < 0 ? 'owe' : 'even')}">${balance < 0 ? '-' : ''}${fmt(Math.abs(balance))} ج</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">إجمالي الإيداعات ${fmt(totalIn)} ج − إجمالي المصروفات ${fmt(totalOut)} ج</div>
        ${debt > 0 ? `<div style="font-size:13px;margin-top:6px;color:var(--debit);font-weight:700;">💳 عليك سلف: ${fmt(debt)} ج</div>` : ''}
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--credit)">${fmt(rIn)}</div><div class="l">إيداع — ${rangeLabel()}</div></div>
        <div><div class="n" style="color:var(--debit)">${fmt(rOut)}</div><div class="l">مصروف — ${rangeLabel()}</div></div>
      </div>
    </div>
  </div>

  ${loansCardHtml()}

  <div class="card">
    <h2>تسجيل حركة</h2>
    <div class="seg">
      <button class="${isOut && !loanManual ? 'on out' : ''}" onclick="personalType='out';loanManual=false;loanChoice=null;renderPersonal()">⬆️ مصروف</button>
      <button class="${!isOut && !loanManual ? 'on in' : ''}" onclick="personalType='in';loanManual=false;loanChoice=null;renderPersonal()">⬇️ إيداع (فلوس دخلت)</button>
      <button class="${loanManual ? 'on out' : ''}" onclick="loanManual=true;loanChoice=null;renderPersonal()">💳 سلفة</button>
    </div>
    <div class="f-grid">
      <div><label>المبلغ</label><input type="text" inputmode="decimal" autocomplete="off" id="pvAmount" placeholder="ج"></div>
      <div><label>${loanManual ? 'من مين / لمين (اسم الجهة)' : (isOut ? 'صرفتها فين / لمين' : 'جت منين')}</label><input type="text" id="pvParty" list="pvLenders" oninput="updateLoanBox()" placeholder="${loanManual ? 'اسم اللي استلفت منه' : (isOut ? 'اختياري: مطعم، محل، فلان' : 'مثال: مرتب، أرباح الشغل، هدية')}"></div>
      <div><label>التصنيف</label><input type="text" id="pvCategory" list="pvCats" oninput="updateLoanBox()" placeholder="${isOut ? 'مثال: أكل، مواصلات' : 'مثال: دخل'}"></div>
      <div><label>&nbsp;</label><button class="btn ${isOut && !loanManual ? 'btn-cheese' : 'btn-credit'}" onclick="addPersonalEntry()">تسجيل</button></div>
      <div class="wide" style="grid-column:1/-1;"><label>ملاحظات</label><input type="text" id="pvNote" oninput="updateLoanBox()" placeholder="أي تفاصيل تفتكرها بعدين (لو كتبت «سلفة» هتتسجل في السلف)" onkeydown="if(event.key==='Enter')addPersonalEntry()"></div>
    </div>
    <div id="loanBox"></div>
    <datalist id="pvCats">${['أكل وشرب', 'مواصلات', 'فواتير', 'إيجار', 'ملابس', 'صحة', 'ترفيه', 'هدايا', 'تعليم', 'عامة'].map(c => `<option value="${c}">`).join('')}</datalist>
    <datalist id="pvLenders">${loansSummary().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
    <div class="stage-note">الحركة هتتسجل بتاريخ: <b>${fmtDay(localDateStr(dateForNew()), {weekday:'long', day:'numeric', month:'numeric'})}</b> (غيّره من شريط الأسبوع فوق).</div>
  </div>

  <div class="card">
    <h2>الحركات — ${rangeLabel()}</h2>
    <div id="personalList"></div>
  </div>`;
  updateLoanBox();
  renderPersonalList();
}

function renderPersonalList(){
  const box = document.getElementById('personalList'); if (!box) return;
  const rows = personalFiltered();
  const q = searchQ.trim();
  const out = sumBy(rows, pOut);
  const inn = sumBy(rows, pIn);
  const byCat = {};
  rows.filter(e => e.type === 'out' && !e.offAccount).forEach(e => { const k = e.category || 'بدون تصنيف'; byCat[k] = (byCat[k] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const tagOf = (e) => e.loan === 'borrow' ? 'سلفة' : (e.loan === 'repay' ? 'سداد سلفة' : (e.type === 'in' ? 'إيداع' : 'مصروف'));

  box.innerHTML = `
    ${q ? `<div class="stage-note" style="margin:0 0 10px;">نتيجة البحث عن «${esc(q)}»: ${rows.length} حركة • إيداع ${fmt(inn)} ج • مصروف ${fmt(out)} ج</div>` : ''}
    ${cats.length ? `<div class="chips">${cats.map(([c, v]) => `<span class="chip">${esc(c)}: ${fmt(v)} ج</span>`).join('')}</div>` : ''}
    ${rows.length ? rows.map(e => `
      <div class="payment-line" style="background:${e.offAccount ? '#F1EEE6' : (e.type === 'in' ? '#F5FAF7' : '#FBF3EF')};">
        <div>
          <span class="tag ${e.type === 'in' ? 'payment' : 'item'}">${tagOf(e)}</span>
          <b style="margin-right:6px;">${esc(e.party) || (e.type === 'in' ? 'إيداع' : 'مصروف')}</b>
          ${e.category && !e.loan ? `<span class="chip" style="padding:2px 9px;font-size:11.5px;">${esc(e.category)}</span>` : ''}
          ${e.offAccount ? '<span class="chip" style="padding:2px 9px;font-size:11.5px;">من برّه حسابي — ما اتخصمش من الرصيد</span>' : ''}
          <span style="color:var(--ink-soft);font-size:12px;margin-right:6px;">${fmtDateTime(e.date)}</span>
          ${e.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">📝 ${esc(e.note)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="${e.offAccount ? '' : (e.type === 'in' ? 'amt-minus' : 'amt-plus')}" ${e.offAccount ? 'style="color:var(--ink-soft);font-weight:700;"' : ''}>${e.offAccount ? '' : (e.type === 'in' ? '+ ' : '- ')}${fmt(e.amount)} ج</span>
          <button class="edit-btn" onclick="editPersonalEntry('${e.id}')" title="تعديل">✎</button>
          <button class="del-btn" onclick="deletePersonalEntry('${e.id}')">✕</button>
        </div>
      </div>`).join('') : `<div class="empty">${q ? 'مفيش نتايج للبحث ده في الفترة المعروضة' : 'مفيش حركات في الفترة دي'}</div>`}`;
}

async function addPersonalEntry(){
  const amount = num(document.getElementById('pvAmount').value) || 0;
  const party = document.getElementById('pvParty').value;
  let category = document.getElementById('pvCategory').value;
  const note = document.getElementById('pvNote').value;
  if (amount <= 0) { showToast('اكتب مبلغ صحيح'); return; }
  const role = loanActive() ? (loanChoice || loanAuto()) : 'none';
  const isLoan = role === 'borrow' || role === 'repay';
  if (isLoan && !party.trim()) { showToast(role === 'borrow' ? 'اكتب اسم اللي استلفت منه' : 'اكتب اسم اللي سدّدتله'); return; }
  const fa = document.getElementById('loanFromAcct');
  const body = isLoan
    ? { type: role === 'borrow' ? 'in' : 'out', loan: role, amount, party, category: category || (role === 'borrow' ? 'سلفة' : 'سداد سلفة'), note, offAccount: role === 'repay' && fa ? !fa.checked : false, date: dateForNew() }
    : { type: personalType, amount, party, category, note, date: dateForNew() };
  try {
    const json = await apiFetch('personal', 'POST', body);
    state.personal.push(json.entry);
    loanChoice = null; loanManual = false;
    renderPersonal();
    showToast(isLoan ? 'اتسجلت السلفة — عليك دلوقتي ' + fmt(loansTotal()) + ' ج' : 'اتسجلت الحركة');
  } catch (e) {}
}
async function deletePersonalEntry(id){
  if (!confirm('حذف الحركة دي؟')) return;
  try {
    await apiFetch('personal/' + id, 'DELETE');
    state.personal = state.personal.filter(e => e.id !== id);
    renderPersonal();
  } catch (e) {}
}
