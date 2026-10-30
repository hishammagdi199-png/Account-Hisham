/* ===== حسابي الشخصي: منفصل تمامًا عن الخزنة وحسابات الشغل ===== */
let personalType = 'out'; // out | in

function personalFiltered(){
  const n = norm(searchQ).trim();
  return state.personal.filter(e => inRange(e.date)).filter(e => {
    if (!n) return true;
    return norm(e.party).includes(n) || norm(e.category).includes(n) || norm(e.note).includes(n) ||
           (/^\d+(\.\d+)?$/.test(n) && String(e.amount).includes(n));
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderPersonal(){
  const app = document.getElementById('app');
  const all = state.personal;
  const balance = sumBy(all, e => e.type === 'in' ? e.amount : -e.amount);
  const totalIn = sumBy(all.filter(e => e.type === 'in'), e => e.amount);
  const totalOut = sumBy(all.filter(e => e.type === 'out'), e => e.amount);
  const inRng = all.filter(e => inRange(e.date));
  const rIn = sumBy(inRng.filter(e => e.type === 'in'), e => e.amount);
  const rOut = sumBy(inRng.filter(e => e.type === 'out'), e => e.amount);
  const isOut = personalType === 'out';

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
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--credit)">${fmt(rIn)}</div><div class="l">إيداع — ${rangeLabel()}</div></div>
        <div><div class="n" style="color:var(--debit)">${fmt(rOut)}</div><div class="l">مصروف — ${rangeLabel()}</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>تسجيل حركة</h2>
    <div class="seg">
      <button class="${isOut ? 'on out' : ''}" onclick="personalType='out';renderPersonal()">⬆️ مصروف</button>
      <button class="${!isOut ? 'on in' : ''}" onclick="personalType='in';renderPersonal()">⬇️ إيداع (فلوس دخلت)</button>
    </div>
    <div class="f-grid">
      <div><label>المبلغ</label><input type="text" inputmode="decimal" autocomplete="off" id="pvAmount" placeholder="ج"></div>
      <div><label>${isOut ? 'صرفتها فين / لمين' : 'جت منين'}</label><input type="text" id="pvParty" placeholder="${isOut ? 'اختياري: مطعم، محل، فلان' : 'مثال: مرتب، أرباح الشغل، هدية'}"></div>
      <div><label>التصنيف</label><input type="text" id="pvCategory" list="pvCats" placeholder="${isOut ? 'مثال: أكل، مواصلات' : 'مثال: دخل'}"></div>
      <div><label>&nbsp;</label><button class="btn ${isOut ? 'btn-cheese' : 'btn-credit'}" onclick="addPersonalEntry()">تسجيل</button></div>
      <div class="wide" style="grid-column:1/-1;"><label>ملاحظات</label><input type="text" id="pvNote" placeholder="أي تفاصيل تفتكرها بعدين" onkeydown="if(event.key==='Enter')addPersonalEntry()"></div>
    </div>
    <datalist id="pvCats">${['أكل وشرب', 'مواصلات', 'فواتير', 'إيجار', 'ملابس', 'صحة', 'ترفيه', 'هدايا', 'تعليم', 'عامة'].map(c => `<option value="${c}">`).join('')}</datalist>
    <div class="stage-note">الحركة هتتسجل بتاريخ: <b>${fmtDay(localDateStr(dateForNew()), {weekday:'long', day:'numeric', month:'numeric'})}</b> (غيّره من شريط الأسبوع فوق).</div>
  </div>

  <div class="card">
    <h2>الحركات — ${rangeLabel()}</h2>
    <div id="personalList"></div>
  </div>`;
  renderPersonalList();
}

function renderPersonalList(){
  const box = document.getElementById('personalList'); if (!box) return;
  const rows = personalFiltered();
  const q = searchQ.trim();
  const out = sumBy(rows.filter(e => e.type === 'out'), e => e.amount);
  const inn = sumBy(rows.filter(e => e.type === 'in'), e => e.amount);
  const byCat = {};
  rows.filter(e => e.type === 'out').forEach(e => { const k = e.category || 'بدون تصنيف'; byCat[k] = (byCat[k] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  box.innerHTML = `
    ${q ? `<div class="stage-note" style="margin:0 0 10px;">نتيجة البحث عن «${esc(q)}»: ${rows.length} حركة • إيداع ${fmt(inn)} ج • مصروف ${fmt(out)} ج</div>` : ''}
    ${cats.length ? `<div class="chips">${cats.map(([c, v]) => `<span class="chip">${esc(c)}: ${fmt(v)} ج</span>`).join('')}</div>` : ''}
    ${rows.length ? rows.map(e => `
      <div class="payment-line" style="background:${e.type === 'in' ? '#F5FAF7' : '#FBF3EF'};">
        <div>
          <span class="tag ${e.type === 'in' ? 'payment' : 'item'}">${e.type === 'in' ? 'إيداع' : 'مصروف'}</span>
          <b style="margin-right:6px;">${esc(e.party) || (e.type === 'in' ? 'إيداع' : 'مصروف')}</b>
          ${e.category ? `<span class="chip" style="padding:2px 9px;font-size:11.5px;">${esc(e.category)}</span>` : ''}
          <span style="color:var(--ink-soft);font-size:12px;margin-right:6px;">${fmtDateTime(e.date)}</span>
          ${e.note ? `<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">📝 ${esc(e.note)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="${e.type === 'in' ? 'amt-minus' : 'amt-plus'}">${e.type === 'in' ? '+' : '-'} ${fmt(e.amount)} ج</span>
          <button class="edit-btn" onclick="editPersonalEntry('${e.id}')" title="تعديل">✎</button>
          <button class="del-btn" onclick="deletePersonalEntry('${e.id}')">✕</button>
        </div>
      </div>`).join('') : `<div class="empty">${q ? 'مفيش نتايج للبحث ده في الفترة المعروضة' : 'مفيش حركات في الفترة دي'}</div>`}`;
}

async function addPersonalEntry(){
  const amount = num(document.getElementById('pvAmount').value) || 0;
  const party = document.getElementById('pvParty').value;
  const category = document.getElementById('pvCategory').value;
  const note = document.getElementById('pvNote').value;
  if (amount <= 0) { showToast('اكتب مبلغ صحيح'); return; }
  try {
    const json = await apiFetch('personal', 'POST', { type: personalType, amount, party, category, note, date: dateForNew() });
    state.personal.push(json.entry);
    renderPersonal();
    showToast('اتسجلت الحركة');
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
