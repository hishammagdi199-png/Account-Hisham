const STORAGE_KEY = 'shop-data-v2';
let state = { products: [], clients: [], suppliers: [], cash: [], personal: [] };
let view = 'home';
let currentClientId = null;
let staged = [];
let draftItems = [];
let counter = 1;

function newId(){ return 'id' + Date.now() + '_' + (counter++); }
function normalizeAr(s){ return (s||'').replace(/[إأآا]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim(); }
function fmt(n){ return (Math.round((n||0)*100)/100).toLocaleString('ar-EG',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function esc(s){ return (s??'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

function getPin(){ return localStorage.getItem('app_pin') || ''; }
function setPinPrompt(){
  const p = prompt('اكتب كلمة السر (اختياري - اسيبها فاضية لو مفيش PIN محدد):', getPin());
  if(p!==null){ localStorage.setItem('app_pin', p.trim()); loadState(); }
}

// طبقة الاتصال بالـ API — بتتكلم مع الجداول الحقيقية في قاعدة البيانات
async function apiFetch(path, method, body){
  const headers = Object.assign(
    method && method!=='GET' ? {'Content-Type':'application/json'} : {},
    getPin() ? {'x-app-pin': getPin()} : {}
  );
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 25000); // لو السيرفر علّق ما نفضلش مستنيين للأبد
  let res;
  try{
    res = await fetch('/api/' + path, {
      method: method || 'GET',
      headers,
      signal: ctrl.signal,
      body: body!==undefined ? JSON.stringify(body) : undefined
    });
  }catch(e){
    showToast(e.name==='AbortError' ? 'السيرفر اتأخر في الرد (أكتر من ٢٥ ثانية)' : 'مفيش اتصال بالسيرفر');
    throw e;
  }finally{ clearTimeout(timer); }
  if(res.status === 401){
    showToast('كلمة السر غلط - دوس على ⚙️ فوق وصححها');
    throw new Error('unauthorized');
  }
  const raw = await res.text().catch(()=>'');
  let json = {};
  try{ json = raw ? JSON.parse(raw) : {}; }catch(e){ json = {}; }
  if(!res.ok){
    // لو الرد مش JSON (مثلًا صفحة خطأ من Vercel) نعرض كود الحالة وبداية الرد عشان نعرف السبب
    const detail = json.message || json.error || ('HTTP ' + res.status + (raw ? ' — ' + raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,140) : ''));
    console.error('API error', method||'GET', path, res.status, raw.slice(0,500));
    showToast('فشل تحميل السيرفر: ' + detail);
    throw new Error(json.error || 'server error');
  }
  return json;
}

function showLoadError(e){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card" style="text-align:center;">
    <h2>مش قادر أحمّل البيانات</h2>
    <p style="color:var(--ink-soft);font-size:13.5px;">${esc((e && e.message) || 'خطأ غير معروف')}</p>
    <p style="font-size:12.5px;color:var(--ink-soft);">افتح <a class="lnk" href="/api/ping" target="_blank">/api/ping</a> (الدالة شغالة؟) و
    <a class="lnk" href="/api/health" target="_blank">/api/health</a> (الداتابيز متصلة؟) وابعتلي اللي بيظهر.</p>
    <button class="btn btn-cheese" onclick="loadState()">إعادة المحاولة</button></div>`;
}
async function loadState(){
  try{
    const json = await apiFetch('state', 'GET');
    state = json.data && json.data.products ? json.data : { products:[], clients:[] };
  }catch(e){
    // ما نعرضش دفتر فاضي (ممكن يتفهم إن البيانات اتمسحت) — نعرض رسالة واضحة وزرار إعادة المحاولة
    showLoadError(e);
    return;
  }
  state.suppliers = state.suppliers || [];
  state.cash = state.cash || [];
  state.personal = state.personal || [];
  render();
}

function getClient(id){ return state.clients.find(c=>c.id===id); }
function productName(id){ const p=state.products.find(p=>p.id===id); return p?p.name:null; }
function productById(id){ return state.products.find(p=>p.id===id); }

function clientBalance(client){
  const inv = client.invoices.reduce((s,i)=>s+i.total,0);
  const pay = client.payments.reduce((s,p)=>s+p.amount,0);
  return Math.round((inv-pay)*100)/100;
}

/* ---------- parsing ---------- */
function stripWhatsappPrefix(line){
  const re = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?\]?\s*-?\s*[^:]{1,40}:\s*/;
  const m = line.match(re);
  return m ? line.slice(m[0].length) : line;
}
function matchProductInContent(content){
  const norm = normalizeAr(content);
  if(!norm) return null;
  let best=null, bestLen=0;
  for(const p of state.products){
    const pn = normalizeAr(p.name);
    if(pn && norm.includes(pn) && pn.length > bestLen){ best = p; bestLen = pn.length; }
  }
  return best;
}
function extractQuantityForProduct(content, product){
  const numbers = content.match(/\d+(?:\.\d+)?/g) || [];
  const productNumbers = (product.name.match(/\d+(?:\.\d+)?/g) || []).slice();
  for(const n of numbers){
    const idx = productNumbers.indexOf(n);
    if(idx !== -1){ productNumbers.splice(idx,1); continue; } // this number belongs to the product's own name (e.g. the "8" in "8ك")
    return num(n);
  }
  return 1;
}
function extractQuantityFallback(content){
  const re = /\d+/g; let m;
  while((m = re.exec(content))){
    const end = m.index + m[0].length;
    const nextChar = content[end] || '';
    if(/[كجغ]/.test(nextChar)) continue;
    return parseInt(m[0],10);
  }
  return 1;
}
// السعر الافتراضي للعميل: آخر سعر اتحاسب بيه على الصنف ده، وإلا سعر الصنف الأساسي
function priceFor(productId){
  const p = productById(productId); const base = p ? p.price : 0;
  const c = getClient(currentClientId); if(!c) return base;
  let last = null;
  c.invoices.forEach(inv=> inv.items.forEach(it=>{
    if(it.productId===productId && (!last || new Date(inv.date) > new Date(last.d))) last = {d:inv.date, p:it.unitPrice};
  }));
  return last ? last.p : base;
}
function parseMessages(text){
  text = normDigits(text); // الأرقام العربي تتحول إنجليزي قبل التحليل
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const paymentKeywords = /(بعت|حولت|دفعت|ارسلت|أرسلت|استلمت)/;
  const out=[];
  for(let raw of lines){
    let content = stripWhatsappPrefix(raw).trim();
    if(!content || /<Media omitted>|omitted/i.test(content)) continue;
    if(paymentKeywords.test(content) && /\d/.test(content)){
      const numMatch = content.match(/(\d+(?:\.\d+)?)/);
      const amount = numMatch?num(numMatch[1]):0;
      out.push({id:newId(), type:'payment', amount, note:content, productId:null, quantity:null, unitPrice:null});
      continue;
    }
    const product = matchProductInContent(content);
    if(product){
      const quantity = extractQuantityForProduct(content, product);
      const unitPrice = priceFor(product.id);
      const amount = Math.round(quantity*unitPrice*100)/100;
      out.push({id:newId(), type:'item', productId:product.id, quantity, unitPrice, amount, note:content});
    } else {
      const quantity = extractQuantityFallback(content);
      out.push({id:newId(), type:'unclear', amount:0, note:content, productId:null, quantity, unitPrice:null});
    }
  }
  return out;
}

/* ---------- products ---------- */
async function addProduct(){
  try{
    const json = await apiFetch('products', 'POST', { name:'صنف جديد', price:0 });
    state.products.push(json.product);
    render();
  }catch(e){}
}
async function updateProduct(id, field, value){
  const p = state.products.find(p=>p.id===id); if(!p) return;
  const newValue = field==='price' ? (num(value)||0) : value;
  p[field] = newValue; // تحديث فوري في الواجهة
  try{
    await apiFetch('products/'+id, 'PUT', { [field]: newValue });
  }catch(e){}
}
async function deleteProduct(id){
  try{
    await apiFetch('products/'+id, 'DELETE');
    state.products = state.products.filter(p=>p.id!==id);
    render();
  }catch(e){}
}

/* ---------- clients ---------- */
async function addClient(){
  const input = document.getElementById('newClientName');
  const name = input.value.trim();
  if(!name){ showToast('اكتب اسم العميل الأول'); return; }
  try{
    const json = await apiFetch('clients', 'POST', { name });
    state.clients.push(json.client);
    input.value='';
    render();
  }catch(e){}
}
async function deleteClient(id){
  if(!confirm('هل تريد حذف هذا العميل وكل سجله؟ لا يمكن التراجع.')) return;
  try{
    await apiFetch('clients/'+id, 'DELETE');
    state.clients = state.clients.filter(c=>c.id!==id);
    render();
  }catch(e){}
}
function openClient(id){ currentClientId=id; view='client'; staged=[]; draftItems=[]; render(); }
function goHome(){ view='home'; currentClientId=null; staged=[]; draftItems=[]; render(); }
async function renameClient(id, value){
  const c = getClient(id); if(!c) return;
  const name = value.trim() || c.name;
  c.name = name;
  try{
    await apiFetch('clients/'+id, 'PUT', { name });
  }catch(e){}
  renderClientView();
}

/* ---------- invoice creation (parse) ---------- */
function doParse(){
  const text = document.getElementById('pasteArea').value;
  if(!text.trim()){ showToast('الصق الرسايل الأول'); return; }
  staged = parseMessages(text);
  renderStaged();
}
function handleFile(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('pasteArea').value = reader.result; showToast('اتحمّل الملف، دوس "تحليل الرسايل"'); };
  reader.readAsText(file, 'UTF-8');
}
function updateStagedField(id, field, value){
  const item = staged.find(s=>s.id===id); if(!item) return;
  if(field==='type') item.type = value;
  if(field==='productId'){
    item.productId = value || null;
    if(item.productId){ item.unitPrice = priceFor(item.productId); item.amount = Math.round((item.quantity||1)*item.unitPrice*100)/100; }
  }
  if(field==='quantity'){
    item.quantity = value===''?1:num(value);
    if(item.productId) item.amount = Math.round(item.quantity*(item.unitPrice||0)*100)/100;
  }
  if(field==='unitPrice'){
    item.unitPrice = num(value)||0;
    item.amount = Math.round((item.quantity||1)*item.unitPrice*100)/100;
  }
  if(field==='amount'){
    item.amount = num(value)||0;
    if(item.type==='item' && item.quantity) item.unitPrice = Math.round(item.amount/item.quantity*100)/100;
  }
}
async function confirmStaged(){
  const client = getClient(currentClientId); if(!client) return;
  const items = staged.filter(s=>s.type==='item' && s.productId);
  const payments = staged.filter(s=>s.type==='payment');
  if(!items.length && !payments.length){ showToast('مفيش عناصر جاهزة للإضافة'); return; }
  try{
    if(items.length){
      const invItems = items.map(s=>({productId:s.productId, quantity:s.quantity, unitPrice:s.unitPrice}));
      const rawText = items.map(s=>s.note).join('\n');
      const json = await apiFetch('clients/'+client.id+'/invoices', 'POST', { items: invItems, rawText, date: dateForNew() });
      client.invoices.push(json.invoice);
    }
    for(const p of payments){
      const json = await apiFetch('clients/'+client.id+'/payments', 'POST', { amount: p.amount, note: p.note, date: dateForNew() });
      client.payments.push(json.payment);
    }
    staged=[];
    document.getElementById('pasteArea').value='';
    renderClientView();
    showToast('تم تسجيل العملية');
  }catch(e){}
}
function discardStaged(){ staged=[]; renderStaged(); }

/* ---------- manual draft invoice ---------- */
function addDraftItem(){
  const productId = document.getElementById('draftProduct').value;
  const qty = num(document.getElementById('draftQty').value)||1;
  const priceRaw = document.getElementById('draftPrice').value;
  if(!productId){ showToast('اختار صنف'); return; }
  const unitPrice = priceRaw==='' ? priceFor(productId) : (num(priceRaw)||0);
  draftItems.push({id:newId(), productId, quantity:qty, unitPrice});
  document.getElementById('draftQty').value='';
  document.getElementById('draftPrice').value='';
  fillDraftPrice();
  renderDraft();
}
function fillDraftPrice(){
  const sel = document.getElementById('draftProduct'); const inp = document.getElementById('draftPrice'); if(!sel||!inp) return;
  inp.value = '';
  inp.placeholder = sel.value ? ('سعر الوحدة — الافتراضي ' + fmt(priceFor(sel.value))) : 'سعر الوحدة';
  updateDraftHint();
}
function updateDraftHint(){
  const sel = document.getElementById('draftProduct'); const el = document.getElementById('draftHint'); if(!sel||!el) return;
  const p = productById(sel.value); if(!p) { el.textContent=''; return; }
  const cur = num(document.getElementById('draftPrice').value);
  const last = priceFor(p.id);
  el.textContent = 'السعر الأساسي للصنف: ' + fmt(p.price) + ' ج' + (last!==p.price ? ' • آخر سعر للعميل ده: ' + fmt(last) + ' ج' : '') +
    (!isNaN(cur) && cur!==p.price ? ' • السعر هنا مختلف عن الأساسي' : '') + ' — تقدر تكتب أي سعر.';
}
function removeDraftItem(id){ draftItems = draftItems.filter(d=>d.id!==id); renderDraft(); }
async function saveDraftInvoice(){
  if(!draftItems.length){ showToast('ضيف صنف الأول'); return; }
  const client = getClient(currentClientId); if(!client) return;
  try{
    const invItems = draftItems.map(d=>({productId:d.productId, quantity:d.quantity, unitPrice:d.unitPrice}));
    const json = await apiFetch('clients/'+client.id+'/invoices', 'POST', { items: invItems, rawText: 'إضافة يدوية', date: dateForNew() });
    client.invoices.push(json.invoice);
    draftItems=[];
    renderClientView();
    showToast('اتحفظت الفاتورة');
  }catch(e){}
}

/* ---------- payments ---------- */
async function addPayment(){
  const amount = num(document.getElementById('payAmount').value)||0;
  const note = document.getElementById('payNote').value;
  if(amount<=0){ showToast('اكتب مبلغ صحيح'); return; }
  const client = getClient(currentClientId); if(!client) return;
  try{
    const json = await apiFetch('clients/'+client.id+'/payments', 'POST', { amount, note, date: dateForNew() });
    client.payments.push(json.payment);
    document.getElementById('payAmount').value=''; document.getElementById('payNote').value='';
    renderClientView();
    showToast('اتسجلت الدفعة');
  }catch(e){}
}
async function deleteInvoice(id){
  const client = getClient(currentClientId); if(!client) return;
  try{
    await apiFetch('invoices/'+id, 'DELETE');
    client.invoices = client.invoices.filter(i=>i.id!==id);
    renderClientView();
  }catch(e){}
}
async function deletePayment(id){
  const client = getClient(currentClientId); if(!client) return;
  try{
    await apiFetch('payments/'+id, 'DELETE');
    client.payments = client.payments.filter(p=>p.id!==id);
    renderClientView();
  }catch(e){}
}

async function resetAll(){
  if(!confirm('هل تريد مسح كل البيانات (الأصناف والعملاء)؟ لا يمكن التراجع.')) return;
  try{
    const json = await apiFetch('reset', 'POST');
    state = json.data;
    goHome();
  }catch(e){}
}

/* ---------- render: HOME ---------- */
function render(){
  switch(view){
    case 'today': return renderToday();
    case 'suppliers': return renderSuppliers();
    case 'supplier': return renderSupplierView();
    case 'cash': return renderCash();
    case 'search': return renderSearch();
    case 'personal': return renderPersonal();
    case 'client': return renderClientView();
    default: return renderHome();
  }
}

function renderHome(){
  const app = document.getElementById('app');
  const totalOwed = state.clients.reduce((s,c)=>s+clientBalance(c),0);
  app.innerHTML = `
  <header class="top">
    <h1>دفتر حساب الجبنة</h1>
    <p>حساب كل عميل لوحده، مع سجل كامل لكل فاتورة</p>
  </header>
  ${navHtml('home')}
  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">إجمالي المطلوب من كل العملاء</div>
        <div class="amount ${totalOwed>0?'owe':(totalOwed<0?'credit':'even')}">${fmt(Math.abs(totalOwed))} ج</div>
      </div>
      <div class="mini-stats"><div><div class="n">${state.clients.length}</div><div class="l">عدد العملاء</div></div></div>
    </div>
  </div>

  ${rangeSummaryHtml()}

  <div class="card">
    <h2>الأصناف والأسعار</h2>
    <div class="products-grid" id="productsGrid"></div>
    <button class="btn btn-outline btn-sm" onclick="addProduct()">+ إضافة صنف</button>
    <div class="stage-note">اكتب اسم الصنف زي ما هتبعته في واتساب بالظبط (مثال: جبنة ثلاجة 8ك) والسعر الكلي للوحدة دي.</div>
  </div>

  <div class="card">
    <div class="top-bar"><h2 style="border:none;margin:0;">العملاء</h2>
      ${exportBar('exportAll')}
    </div>
    <div class="client-list" id="clientList"></div>
    <div class="add-client-row">
      <input id="newClientName" placeholder="اسم عميل جديد" onkeydown="if(event.key==='Enter')addClient()">
      <button class="btn btn-cheese" onclick="addClient()">+ إضافة عميل</button>
    </div>
  </div>

  <div class="footer-note">
    <button class="btn btn-ghost btn-sm" onclick="resetAll()">مسح كل البيانات</button>
    <div style="margin-top:8px;">البيانات متزامنة على كل أجهزتك تلقائيًا</div>
  </div>
  `;
  renderProducts();
  renderClientList();
}

function renderProducts(){
  const grid = document.getElementById('productsGrid'); if(!grid) return;
  grid.innerHTML = state.products.map(p=>`
    <div class="product-row">
      <input value="${esc(p.name)}" placeholder="اسم الصنف" onchange="updateProduct('${p.id}','name',this.value)">
      <div class="price-suffix"><input type="text" inputmode="decimal" autocomplete="off" placeholder="السعر" value="${p.price}" onchange="updateProduct('${p.id}','price',this.value)"></div>
      <button class="icon-btn" onclick="deleteProduct('${p.id}')" title="حذف">✕</button>
    </div>
  `).join('');
}
function renderClientList(){
  const list = document.getElementById('clientList'); if(!list) return;
  if(!state.clients.length){ list.innerHTML = '<div class="empty">لسه مفيش عملاء، ضيف أول عميل تحت</div>'; return; }
  list.innerHTML = state.clients.map(c=>{
    const bal = clientBalance(c);
    const cls = bal>0?'owe':(bal<0?'credit':'even');
    return `
    <div class="client-card" onclick="openClient('${c.id}')">
      <div class="client-name">${esc(c.name)}</div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div class="client-bal amount ${cls}" style="font-size:15px;">${fmt(Math.abs(bal))} ج ${bal>0?'مطلوب':(bal<0?'رصيد له':'')}</div>
        <button class="icon-btn" onclick="event.stopPropagation();deleteClient('${c.id}')" title="حذف">✕</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------- render: CLIENT DETAIL ---------- */
function renderClientView(){
  const app = document.getElementById('app');
  const client = getClient(currentClientId);
  if(!client){ goHome(); return; }
  const bal = clientBalance(client);
  const balClass = bal>0?'owe':(bal<0?'credit':'even');
  const balLabel = bal>0?'مطلوب من العميل':(bal<0?'رصيد زيادة للعميل':'الحساب متزن');

  app.innerHTML = `
  <div class="top-bar">
    <button class="back-btn" onclick="goHome()">→ كل العملاء</button>
  </div>

  <header class="top" style="margin-top:6px;">
    <h1 style="font-size:26px;" contenteditable="true" onblur="renameClient('${client.id}', this.textContent)">${esc(client.name)}</h1>
  </header>
  ${navHtml('client')}
  ${exportBar('exportClient', client.id)}

  <div class="receipt">
    <div class="balance-row">
      <div class="balance-main">
        <div class="label">${balLabel}</div>
        <div class="amount ${balClass}">${fmt(Math.abs(bal))} ج</div>
      </div>
      <div class="mini-stats">
        <div><div class="n" style="color:var(--debit)">${fmt(client.invoices.reduce((s,i)=>s+i.total,0))}</div><div class="l">إجمالي الفواتير</div></div>
        <div><div class="n" style="color:var(--credit)">${fmt(client.payments.reduce((s,p)=>s+p.amount,0))}</div><div class="l">إجمالي المدفوع</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>فاتورة جديدة من رسايل واتساب</h2>
    <textarea id="pasteArea" placeholder="الصق رسايل الواتساب هنا، كل صنف في سطر...&#10;مثال:&#10;2 ثلاجة 8ك&#10;كيري 1ك&#10;بعتلك 300 جنيه"></textarea>
    <div class="row-actions">
      <button class="btn btn-cheese" onclick="doParse()">تحليل الرسايل</button>
      <label class="file-label">📄 رفع ملف تصدير الشات (.txt)
        <input type="file" accept=".txt" onchange="handleFile(event)">
      </label>
    </div>
    <div id="stagedArea"></div>
  </div>

  <div class="card">
    <h2>إضافة فاتورة يدويًا</h2>
    <div class="draft-grid">
      <div><label>الصنف</label>
        <select id="draftProduct" onchange="fillDraftPrice()">${state.products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${fmt(p.price)} ج</option>`).join('')}</select>
      </div>
      <div><label>الكمية</label><input type="text" inputmode="decimal" autocomplete="off" id="draftQty" placeholder="الكمية (فاضية = 1)"></div>
      <div><label>سعر الوحدة للعميل ده</label><input type="text" inputmode="decimal" autocomplete="off" id="draftPrice" placeholder="ج" oninput="updateDraftHint()"></div>
      <div><button class="btn btn-outline btn-sm" onclick="addDraftItem()">+ إضافة للفاتورة</button></div>
    </div>
    <div class="stage-note" id="draftHint"></div>
    <div class="draft-list" id="draftList"></div>
  </div>

  <div class="card">
    <h2>تسجيل دفعة (خصم من الحساب)</h2>
    <div class="pay-grid">
      <div><label>المبلغ</label><input type="text" inputmode="decimal" autocomplete="off" id="payAmount" placeholder="ج"></div>
      <div><label>ملاحظة</label><input type="text" id="payNote" placeholder="اختياري"></div>
      <div><button class="btn btn-credit" onclick="addPayment()">تسجيل الدفعة</button></div>
    </div>
  </div>

  <div class="card">
    <h2>سجل العميل</h2>
    <div id="historyArea"></div>
  </div>
  `;
  renderStaged();
  fillDraftPrice();
  renderDraft();
  renderHistory();
}

function renderStaged(){
  const area = document.getElementById('stagedArea'); if(!area) return;
  if(!staged.length){ area.innerHTML=''; return; }
  area.innerHTML = `
    <div class="stage-note">راجع النتايج قبل ما تضيفها — الأصناف هتتجمع في فاتورة واحدة، والدفعات هتتسجل لوحدها:</div>
    <table>
      <tr><th>النوع</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th><th>النص الأصلي</th></tr>
      ${staged.map(s=>`
        <tr>
          <td><select onchange="updateStagedField('${s.id}','type',this.value); renderStaged();">
            <option value="item" ${s.type==='item'?'selected':''}>صنف</option>
            <option value="payment" ${s.type==='payment'?'selected':''}>دفعة</option>
            <option value="unclear" ${s.type==='unclear'?'selected':''}>تجاهل</option>
          </select></td>
          <td>${s.type==='item' ? `<select onchange="updateStagedField('${s.id}','productId',this.value); renderStaged();">
              <option value="">اختر صنف</option>
              ${state.products.map(p=>`<option value="${p.id}" ${p.id===s.productId?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>` : '—'}</td>
          <td>${s.type==='item' ? `<input class="tbl-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${s.quantity??1}" onchange="updateStagedField('${s.id}','quantity',this.value); renderStaged();">` : '—'}</td>
          <td>${s.type==='item' ? `<input class="tbl-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${s.unitPrice??0}" onchange="updateStagedField('${s.id}','unitPrice',this.value); renderStaged();">` : '—'}</td>
          <td><input class="tbl-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${s.amount}" onchange="updateStagedField('${s.id}','amount',this.value); renderStaged();"></td>
          <td style="color:var(--ink-soft);font-size:12px;">${esc(s.note)}</td>
        </tr>
      `).join('')}
    </table>
    <div class="row-actions">
      <button class="btn btn-cheese" onclick="confirmStaged()">✓ تأكيد وإضافة للحساب</button>
      <button class="btn btn-ghost" onclick="discardStaged()">إلغاء</button>
    </div>
  `;
}

function renderDraft(){
  const area = document.getElementById('draftList'); if(!area) return;
  if(!draftItems.length){ area.innerHTML=''; return; }
  let total=0;
  const rows = draftItems.map(d=>{
    const p = productById(d.productId);
    const sub = Math.round(d.unitPrice*d.quantity*100)/100; total+=sub;
    return `<tr><td>${p?esc(p.name):'—'}</td><td>${d.quantity}</td><td>${fmt(d.unitPrice)} ج</td><td>${fmt(sub)} ج</td>
      <td><button class="del-btn" onclick="removeDraftItem('${d.id}')">✕</button></td></tr>`;
  }).join('');
  area.innerHTML = `
    <table><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr>${rows}</table>
    <div class="row-actions">
      <div style="font-weight:700;">الإجمالي: ${fmt(total)} ج</div>
      <button class="btn btn-cheese btn-sm" onclick="saveDraftInvoice()">حفظ الفاتورة</button>
    </div>`;
}

function renderHistory(){
  const area = document.getElementById('historyArea'); if(!area) return;
  const client = getClient(currentClientId); if(!client) return;
  const events = [
    ...client.invoices.map(i=>({date:i.date, kind:'invoice', ref:i})),
    ...client.payments.map(p=>({date:p.date, kind:'payment', ref:p})),
  ].sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(!events.length){ area.innerHTML = '<div class="empty">لسه مفيش فواتير أو دفعات</div>'; return; }
  area.innerHTML = events.map(e=>{
    const dt = new Date(e.date);
    const dateStr = dt.toLocaleDateString('ar-EG') + ' ' + dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
    if(e.kind==='invoice'){
      return `<div class="invoice-card">
        <div class="invoice-head"><span class="tag item">فاتورة</span><span class="dt">${dateStr}</span></div>
        <table>${e.ref.items.map(it=>`<tr><td>${esc(it.productName)}</td><td>x${it.quantity}</td><td>${fmt(it.unitPrice)} ج</td><td>${fmt(it.subtotal)} ج</td></tr>`).join('')}</table>
        <div class="invoice-head" style="margin-top:6px;margin-bottom:0;">
          <span class="invoice-total">الإجمالي: ${fmt(e.ref.total)} ج</span>
          <button class="del-btn" onclick="deleteInvoice('${e.ref.id}')">حذف الفاتورة ✕</button>
        </div>
      </div>`;
    } else {
      return `<div class="payment-line">
        <div><span class="tag payment">دفعة</span> <span style="margin-right:8px;color:var(--ink-soft);font-size:12px;">${dateStr}</span>
          ${e.ref.note?`<div class="pl-note" style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${esc(e.ref.note)}</div>`:''}</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="amt-minus">- ${fmt(e.ref.amount)} ج</span>
          <button class="edit-btn" onclick="editClientPayment('${client.id}','${e.ref.id}')" title="تعديل">✎</button>
          <button class="del-btn" onclick="deletePayment('${e.ref.id}')">✕</button>
        </div>
      </div>`;
    }
  }).join('');
}

loadState();
