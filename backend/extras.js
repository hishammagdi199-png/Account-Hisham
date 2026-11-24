// backend/extras.js
// إضافات: (1) مرتجع من العميل  (2) مرتجع للمورد  (3) تعديل فاتورة المورد كاملة (أصناف / كميات / أسعار)
// المرتجعات في جداول لوحدها، فمستحيل تتحسب كحركة في الخزنة.
const { randomUUID } = require('crypto');
const db = require('./db');

let pool;
function getPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL مش موجود. راجع ملف .env محلياً أو إعدادات Vercel.');
        }
        const { Pool } = require('pg');
        const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: isLocal ? false : { rejectUnauthorized: false },
            max: process.env.VERCEL ? 1 : 5,
            connectionTimeoutMillis: 8000,
            idleTimeoutMillis: 10000,
            allowExitOnIdle: true,
        });
        pool.on('error', (err) => { console.error('pg pool error (extras):', err && err.message); pool = null; });
    }
    return pool;
}

const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
function pickDate(d) {
    const x = d ? new Date(d) : null;
    return x && !isNaN(x.getTime()) ? x : new Date();
}

let schemaPromise = null;
function ensure() {
    if (!schemaPromise) schemaPromise = _ensure().catch((e) => { schemaPromise = null; throw e; });
    return schemaPromise;
}
async function _ensure() {
    await db.ping(); // بيتأكد إن الجداول الأساسية (clients / suppliers / products ...) موجودة الأول
    await getPool().query(`
    CREATE TABLE IF NOT EXISTS client_returns (
      id         TEXT PRIMARY KEY,
      client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total      NUMERIC(12,2) NOT NULL DEFAULT 0,
      note       TEXT,
      items      JSONB
    );
    CREATE TABLE IF NOT EXISTS supplier_returns (
      id           TEXT PRIMARY KEY,
      supplier_id  TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total        NUMERIC(12,2) NOT NULL DEFAULT 0,
      note         TEXT,
      items        JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_client_returns_client_id     ON client_returns(client_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier_id ON supplier_returns(supplier_id);
  `);
}

// تجهيز سطور الأصناف: بيجيب اسم الصنف من الداتابيز ويحسب الإجمالي
// priceKey = 'unitPrice' (عميل) أو 'unitCost' (مورد) ، withSell = يحفظ سعر البيع الحالي (لفواتير البضاعة)
async function normItems(items, priceKey, withSell) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) throw new Error('ضيف صنف واحد على الأقل');
    const ids = Array.from(new Set(list.map((i) => i.productId).filter(Boolean)));
    const prods = {};
    if (ids.length) {
        const r = await getPool().query('SELECT id, name, price FROM products WHERE id = ANY($1)', [ids]);
        r.rows.forEach((p) => { prods[p.id] = p; });
    }
    return list.map((it) => {
        const p = it.productId ? prods[it.productId] : null;
        if (!p && !String(it.productName || '').trim()) throw new Error('اختار الصنف في كل السطور');
        const quantity = num(it.quantity);
        if (!(quantity > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
        const unit = num(it[priceKey]);
        if (unit < 0) throw new Error('السعر لازم يكون صفر أو أكتر');
        const row = {
            productId: p ? p.id : null,
            productName: p ? p.name : String(it.productName || '').trim(),
            quantity,
            subtotal: round2(quantity * unit),
        };
        row[priceKey] = round2(unit);
        if (withSell) row.sellPrice = p ? num(p.price) : num(it.sellPrice);
        return row;
    });
}

const mapRet = (r, ownerKey, ownerCol) => {
    const o = {
        id: r.id,
        date: new Date(r.date).toISOString(),
        total: num(r.total),
        amount: num(r.total), // نفس القيمة باسم amount عشان كود الإكسيل القديم
        note: r.note || '',
        items: r.items || [],
    };
    o[ownerKey] = r[ownerCol];
    return o;
};
const mapTxn = (r) => ({
    id: r.id,
    kind: r.kind,
    amount: num(r.amount),
    note: r.note || '',
    fromCash: r.from_cash !== false,
    appliesTo: r.applies_to || null,
    items: r.items || null,
    date: new Date(r.date).toISOString(),
});

/* ---------------- كل المرتجعات (بتتحمّل مع الصفحة) ---------------- */
async function listReturns() {
    await ensure();
    const p = getPool();
    const c = await p.query('SELECT * FROM client_returns ORDER BY date ASC');
    const s = await p.query('SELECT * FROM supplier_returns ORDER BY date ASC');
    return {
        clientReturns: c.rows.map((r) => mapRet(r, 'clientId', 'client_id')),
        supplierReturns: s.rows.map((r) => mapRet(r, 'supplierId', 'supplier_id')),
    };
}

/* ---------------- إنشاء / تعديل / حذف مرتجع (مشترك بين العميل والمورد) ---------------- */
async function createReturn(cfg, ownerId, { items, note, date }) {
    await ensure();
    const p = getPool();
    const o = await p.query(`SELECT 1 FROM ${cfg.ownerTable} WHERE id=$1`, [ownerId]);
    if (!o.rowCount) throw new Error(cfg.missing);
    const rows = await normItems(items, cfg.priceKey, false);
    const total = round2(rows.reduce((s, x) => s + x.subtotal, 0));
    if (!(total > 0)) throw new Error('قيمة المرتجع لازم تكون أكبر من صفر');
    const r = await p.query(
        `INSERT INTO ${cfg.table} (id, ${cfg.ownerCol}, date, total, note, items) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), ownerId, pickDate(date).toISOString(), total, String(note || '').trim(), JSON.stringify(rows)]
    );
    return mapRet(r.rows[0], cfg.ownerKey, cfg.ownerCol);
}
async function updateReturn(cfg, id, { items, note, date }) {
    await ensure();
    const p = getPool();
    const cur = await p.query(`SELECT * FROM ${cfg.table} WHERE id=$1`, [id]);
    if (!cur.rows[0]) throw new Error('المرتجع مش موجود');
    const sets = [];
    const vals = [];
    const put = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (items !== undefined) {
        const rows = await normItems(items, cfg.priceKey, false);
        const total = round2(rows.reduce((s, x) => s + x.subtotal, 0));
        if (!(total > 0)) throw new Error('قيمة المرتجع لازم تكون أكبر من صفر');
        put('items', JSON.stringify(rows));
        put('total', total);
    }
    if (note !== undefined) put('note', String(note).trim());
    if (date) put('date', pickDate(date).toISOString());
    if (!sets.length) return mapRet(cur.rows[0], cfg.ownerKey, cfg.ownerCol);
    vals.push(id);
    const r = await p.query(`UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
    return mapRet(r.rows[0], cfg.ownerKey, cfg.ownerCol);
}
async function deleteReturn(cfg, id) {
    await ensure();
    await getPool().query(`DELETE FROM ${cfg.table} WHERE id=$1`, [id]);
}

const CLIENT = { table: 'client_returns', ownerTable: 'clients', ownerCol: 'client_id', ownerKey: 'clientId', priceKey: 'unitPrice', missing: 'العميل مش موجود' };
const SUPPLIER = { table: 'supplier_returns', ownerTable: 'suppliers', ownerCol: 'supplier_id', ownerKey: 'supplierId', priceKey: 'unitCost', missing: 'المورد مش موجود' };

/* ---------------- تعديل فاتورة بضاعة من المورد كاملة ---------------- */
async function updateSupplierInvoice(id, { items, note, date }) {
    await ensure();
    const p = getPool();
    const cur = await p.query('SELECT * FROM supplier_txns WHERE id=$1', [id]);
    const t = cur.rows[0];
    if (!t) throw new Error('الفاتورة مش موجودة');
    if (t.kind !== 'goods') throw new Error('دي مش فاتورة بضاعة');
    const rows = await normItems(items, 'unitCost', true);
    const amount = round2(rows.reduce((s, x) => s + x.subtotal, 0));
    if (!(amount > 0)) throw new Error('إجمالي الفاتورة لازم يكون أكبر من صفر');
    const sets = ['amount=$1', 'items=$2'];
    const vals = [amount, JSON.stringify(rows)];
    if (note !== undefined) { vals.push(String(note)); sets.push(`note=$${vals.length}`); }
    if (date) { vals.push(pickDate(date).toISOString()); sets.push(`date=$${vals.length}`); }
    vals.push(id);
    const r = await p.query(`UPDATE supplier_txns SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
    return mapTxn(r.rows[0]);
}

module.exports = {
    listReturns,
    createClientReturn: (clientId, body) => createReturn(CLIENT, clientId, body || {}),
    updateClientReturn: (id, body) => updateReturn(CLIENT, id, body || {}),
    deleteClientReturn: (id) => deleteReturn(CLIENT, id),
    createSupplierReturn: (supplierId, body) => createReturn(SUPPLIER, supplierId, body || {}),
    updateSupplierReturn: (id, body) => updateReturn(SUPPLIER, id, body || {}),
    deleteSupplierReturn: (id) => deleteReturn(SUPPLIER, id),
    updateSupplierInvoice,
};
