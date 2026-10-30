// backend/db.js
// تعديل: دعم التشغيل المحلي (Local) والنشر السحابي (Vercel) في نفس الوقت
const { randomUUID } = require('crypto');

let pool;

function getPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL مش موجود. راجع ملف .env محلياً أو إعدادات Vercel.');
        }

        const { Pool, types } = require('pg');
        // TIMESTAMP بدون timezone: نخزّن ونقرا دايمًا بتوقيت UTC عشان نفس البيانات تطلع صح محليًا وعلى Vercel
        types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
        const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: isLocal ? false : { rejectUnauthorized: false },
            max: process.env.VERCEL ? 1 : 10, // على Vercel كل function بتاخد اتصال واحد
            connectionTimeoutMillis: 8000,
            idleTimeoutMillis: 10000,   // نقفل الاتصال الخامل قبل ما Neon يقفله هو
            allowExitOnIdle: true,
        });
        // من غير السطر ده، أي اتصال خامل Neon يقطعه بيعمل Uncaught error ويوقّع الـ function كلها
        pool.on('error', (err) => { console.error('pg pool error:', err && err.message); pool = null; });
    }
    return pool;
}

// دالة للتأكد من الجداول
// تاريخ اختياري من الواجهة (عشان تسجّل عملية بتاريخ يوم تاني)، ولو مش صالح نستخدم دلوقتي
function pickDate(d) {
    const x = d ? new Date(d) : null;
    return x && !isNaN(x.getTime()) ? x : new Date();
}

let schemaPromise = null;
function ensureSchema() {
    if (!schemaPromise) schemaPromise = _ensureSchema().catch((e) => { schemaPromise = null; throw e; });
    return schemaPromise;
}
async function _ensureSchema() {
    const p = getPool();
    await p.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      price       NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clients (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id          TEXT PRIMARY KEY,
      client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      date        TIMESTAMP NOT NULL DEFAULT NOW(),
      total       NUMERIC(12,2) NOT NULL DEFAULT 0,
      raw_text    TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id            TEXT PRIMARY KEY,
      invoice_id    TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id    TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name  TEXT NOT NULL,
      quantity      NUMERIC(12,2) NOT NULL DEFAULT 1,
      unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
      subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id          TEXT PRIMARY KEY,
      client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      date        TIMESTAMP NOT NULL DEFAULT NOW(),
      amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      note        TEXT
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS supplier_txns (
      id          TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('goods','payment')),
      amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      note        TEXT,
      from_cash   BOOLEAN NOT NULL DEFAULT TRUE,
      date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE supplier_txns ADD COLUMN IF NOT EXISTS items JSONB;
    CREATE TABLE IF NOT EXISTS cash_entries (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK (type IN ('in','out')),
      amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      payee       TEXT,
      reason      TEXT,
      date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS personal_entries (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK (type IN ('in','out')),
      amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      party       TEXT,
      category    TEXT,
      note        TEXT,
      date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_txns_supplier_id ON supplier_txns(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id      ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_payments_client_id       ON payments(client_id);
  `);
}

const numOr0 = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v)) ? 0 : parseFloat(v));
const mapProduct = (r) => ({ id: r.id, name: r.name, price: numOr0(r.price) });
const mapClientBase = (r) => ({ id: r.id, name: r.name, phone: r.phone || '' });

/* ---------------- products ---------------- */
async function listProducts() {
    await ensureSchema();
    const r = await getPool().query('SELECT * FROM products ORDER BY created_at ASC');
    return r.rows.map(mapProduct);
}
// فحص سريع للاتصال بالداتابيز
async function ping() {
    await ensureSchema();
    await getPool().query('SELECT 1');
}

async function createProduct({ name, price }) {
    await ensureSchema();
    const id = randomUUID();
    const n = name && name.trim() ? name.trim() : 'صنف جديد';
    const r = await getPool().query(
        'INSERT INTO products (id, name, price) VALUES ($1,$2,$3) RETURNING *', [id, n, numOr0(price)]
    );
    return mapProduct(r.rows[0]);
}
async function updateProduct(id, fields) {
    await ensureSchema();
    const sets = [];
    const vals = [];
    let i = 1;
    if (fields.name !== undefined) { sets.push(`name=$${i++}`); vals.push(fields.name); }
    if (fields.price !== undefined) { sets.push(`price=$${i++}`); vals.push(numOr0(fields.price)); }
    if (!sets.length) {
        const r = await getPool().query('SELECT * FROM products WHERE id=$1', [id]);
        return r.rows[0] ? mapProduct(r.rows[0]) : null;
    }
    vals.push(id);
    const r = await getPool().query(`UPDATE products SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
    return r.rows[0] ? mapProduct(r.rows[0]) : null;
}
async function deleteProduct(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM products WHERE id=$1', [id]);
}

/* ---------------- clients ---------------- */
async function createClient({ name, phone }) {
    await ensureSchema();
    const id = randomUUID();
    const n = (name || '').trim();
    const r = await getPool().query(
        'INSERT INTO clients (id, name, phone) VALUES ($1,$2,$3) RETURNING *', [id, n, phone || '']
    );
    return { ...mapClientBase(r.rows[0]), invoices: [], payments: [] };
}
async function updateClient(id, fields) {
    await ensureSchema();
    const sets = [];
    const vals = [];
    let i = 1;
    if (fields.name !== undefined) { sets.push(`name=$${i++}`); vals.push(fields.name); }
    if (fields.phone !== undefined) { sets.push(`phone=$${i++}`); vals.push(fields.phone); }
    if (!sets.length) {
        const r = await getPool().query('SELECT * FROM clients WHERE id=$1', [id]);
        return r.rows[0] ? mapClientBase(r.rows[0]) : null;
    }
    vals.push(id);
    const r = await getPool().query(`UPDATE clients SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
    return r.rows[0] ? mapClientBase(r.rows[0]) : null;
}
async function deleteClient(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM clients WHERE id=$1', [id]);
}

/* ---------------- invoices ---------------- */
async function createInvoice(clientId, { items, rawText, date }) {
    await ensureSchema();
    const list = Array.isArray(items) ? items : [];
    if (!list.length) throw new Error('لا يوجد أصناف للفاتورة');
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const invoiceId = randomUUID();
        const now = pickDate(date);
        let total = 0;
        const itemRows = [];
        for (const it of list) {
            const pr = await client.query('SELECT * FROM products WHERE id=$1', [it.productId]);
            const product = pr.rows[0];
            const quantity = numOr0(it.quantity) || 1;
            // السعر ممكن يتكتب يدوي لكل عميل/فاتورة، ولو مش مكتوب ناخد سعر الصنف الأساسي
            const custom = it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== '' && Number.isFinite(Number(it.unitPrice)) && Number(it.unitPrice) >= 0;
            const unitPrice = custom ? Math.round(Number(it.unitPrice) * 100) / 100 : (product ? numOr0(product.price) : 0);
            const subtotal = Math.round(quantity * unitPrice * 100) / 100;
            total += subtotal;
            itemRows.push({
                id: randomUUID(),
                productId: product ? product.id : null,
                productName: product ? product.name : (it.productName || ''),
                quantity,
                unitPrice,
                subtotal,
            });
        }
        total = Math.round(total * 100) / 100;
        await client.query(
            'INSERT INTO invoices (id, client_id, date, total, raw_text) VALUES ($1,$2,$3,$4,$5)', [invoiceId, clientId, now.toISOString(), total, rawText || null]
        );
        for (const it of itemRows) {
            await client.query(
                'INSERT INTO invoice_items (id, invoice_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7)', [it.id, invoiceId, it.productId, it.productName, it.quantity, it.unitPrice, it.subtotal]
            );
        }
        await client.query('COMMIT');
        return {
            id: invoiceId,
            date: now.toISOString(),
            total,
            rawText: rawText || '',
            items: itemRows.map((it) => ({
                productId: it.productId,
                productName: it.productName,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                subtotal: it.subtotal,
            })),
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
async function deleteInvoice(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM invoices WHERE id=$1', [id]);
}

/* ---------------- payments ---------------- */
async function createPayment(clientId, { amount, note, date }) {
    await ensureSchema();
    const id = randomUUID();
    const amt = numOr0(amount);
    const now = pickDate(date);
    await getPool().query(
        'INSERT INTO payments (id, client_id, date, amount, note) VALUES ($1,$2,$3,$4,$5)', [id, clientId, now.toISOString(), amt, note || '']
    );
    return { id, date: now.toISOString(), amount: amt, note: note || '' };
}
async function deletePayment(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM payments WHERE id=$1', [id]);
}


/* ---------------- suppliers (الموردين) ---------------- */
const mapTxn = (r) => ({
    id: r.id,
    kind: r.kind,
    amount: numOr0(r.amount),
    note: r.note || '',
    fromCash: r.from_cash !== false,
    items: r.items || null,
    date: new Date(r.date).toISOString(),
});
async function createSupplier({ name, phone }) {
    await ensureSchema();
    const id = randomUUID();
    const r = await getPool().query(
        'INSERT INTO suppliers (id, name, phone) VALUES ($1,$2,$3) RETURNING *', [id, (name || '').trim(), phone || '']
    );
    return { ...mapClientBase(r.rows[0]), txns: [] };
}
async function updateSupplier(id, fields) {
    await ensureSchema();
    const sets = [];
    const vals = [];
    let i = 1;
    if (fields.name !== undefined) { sets.push(`name=$${i++}`); vals.push(fields.name); }
    if (fields.phone !== undefined) { sets.push(`phone=$${i++}`); vals.push(fields.phone); }
    if (!sets.length) return null;
    vals.push(id);
    const r = await getPool().query(`UPDATE suppliers SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
    return r.rows[0] ? mapClientBase(r.rows[0]) : null;
}
async function deleteSupplier(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM suppliers WHERE id=$1', [id]);
}
async function createSupplierTxn(supplierId, { kind, amount, note, fromCash, items, date }) {
    await ensureSchema();
    if (kind !== 'goods' && kind !== 'payment') throw new Error('نوع العملية غير صحيح');
    const pool = getPool();
    let amt = numOr0(amount);
    let itemsJson = null;
    if (kind === 'goods' && Array.isArray(items)) {
        if (!items.length) throw new Error('ضيف صنف واحد على الأقل في الفاتورة');
        const rows = [];
        for (const it of items) {
            const pr = await pool.query('SELECT * FROM products WHERE id=$1', [it.productId]);
            const product = pr.rows[0];
            const quantity = numOr0(it.quantity) || 1;
            const unitCost = numOr0(it.unitCost);
            rows.push({
                productId: product ? product.id : null,
                productName: product ? product.name : (it.productName || ''),
                quantity,
                unitCost,
                sellPrice: product ? numOr0(product.price) : numOr0(it.sellPrice),
                subtotal: Math.round(quantity * unitCost * 100) / 100,
            });
        }
        amt = Math.round(rows.reduce((t, x) => t + x.subtotal, 0) * 100) / 100;
        itemsJson = JSON.stringify(rows);
    }
    if (amt <= 0) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const r = await pool.query(
        'INSERT INTO supplier_txns (id, supplier_id, kind, amount, note, from_cash, items, date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [randomUUID(), supplierId, kind, amt, note || '', fromCash !== false, itemsJson, pickDate(date).toISOString()]
    );
    return mapTxn(r.rows[0]);
}
async function deleteSupplierTxn(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM supplier_txns WHERE id=$1', [id]);
}

/* ---------------- cash box (الخزنة) ---------------- */
const mapCash = (r) => ({
    id: r.id,
    type: r.type,
    amount: numOr0(r.amount),
    payee: r.payee || '',
    reason: r.reason || '',
    date: new Date(r.date).toISOString(),
});
async function createCashEntry({ type, amount, payee, reason, date }) {
    await ensureSchema();
    if (type !== 'in' && type !== 'out') throw new Error('نوع الحركة غير صحيح');
    const amt = numOr0(amount);
    if (amt <= 0) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const r = await getPool().query(
        'INSERT INTO cash_entries (id, type, amount, payee, reason, date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(), type, amt, (payee || '').trim(), (reason || '').trim(), pickDate(date).toISOString()]
    );
    return mapCash(r.rows[0]);
}
async function deleteCashEntry(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM cash_entries WHERE id=$1', [id]);
}

/* ---------------- حسابي الشخصي (منفصل تمامًا عن الخزنة) ---------------- */
const mapPersonal = (r) => ({
    id: r.id,
    type: r.type,
    amount: numOr0(r.amount),
    party: r.party || '',
    category: r.category || '',
    note: r.note || '',
    date: new Date(r.date).toISOString(),
});
async function createPersonalEntry({ type, amount, party, category, note, date }) {
    await ensureSchema();
    if (type !== 'in' && type !== 'out') throw new Error('نوع الحركة غير صحيح');
    const amt = numOr0(amount);
    if (amt <= 0) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const r = await getPool().query(
        'INSERT INTO personal_entries (id, type, amount, party, category, note, date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [randomUUID(), type, amt, (party || '').trim(), (category || '').trim(), (note || '').trim(), pickDate(date).toISOString()]
    );
    return mapPersonal(r.rows[0]);
}
async function deletePersonalEntry(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM personal_entries WHERE id=$1', [id]);
}

/* ---------------- full state (for initial page load) ---------------- */
async function getFullState() {
    await ensureSchema();
    const p = getPool();
    const [productsR, clientsR, invoicesR, itemsR, paymentsR, suppliersR, txnsR, cashR, personalR] = await Promise.all([
        p.query('SELECT * FROM products ORDER BY created_at ASC'),
        p.query('SELECT * FROM clients ORDER BY created_at ASC'),
        p.query('SELECT * FROM invoices ORDER BY date ASC'),
        p.query('SELECT * FROM invoice_items'),
        p.query('SELECT * FROM payments ORDER BY date ASC'),
        p.query('SELECT * FROM suppliers ORDER BY created_at ASC'),
        p.query('SELECT * FROM supplier_txns ORDER BY date ASC'),
        p.query('SELECT * FROM cash_entries ORDER BY date ASC'),
        p.query('SELECT * FROM personal_entries ORDER BY date ASC'),
    ]);
    const itemsByInvoice = {};
    for (const row of itemsR.rows) {
        (itemsByInvoice[row.invoice_id] ||= []).push({
            productId: row.product_id,
            productName: row.product_name,
            quantity: numOr0(row.quantity),
            unitPrice: numOr0(row.unit_price),
            subtotal: numOr0(row.subtotal),
        });
    }
    const invoicesByClient = {};
    for (const row of invoicesR.rows) {
        (invoicesByClient[row.client_id] ||= []).push({
            id: row.id,
            date: row.date.toISOString(),
            total: numOr0(row.total),
            rawText: row.raw_text || '',
            items: itemsByInvoice[row.id] || [],
        });
    }
    const paymentsByClient = {};
    for (const row of paymentsR.rows) {
        (paymentsByClient[row.client_id] ||= []).push({
            id: row.id,
            date: row.date.toISOString(),
            amount: numOr0(row.amount),
            note: row.note || '',
        });
    }
    const clients = clientsR.rows.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        invoices: invoicesByClient[c.id] || [],
        payments: paymentsByClient[c.id] || [],
    }));
    const products = productsR.rows.map(mapProduct);
    const txnsBySupplier = {};
    for (const row of txnsR.rows) (txnsBySupplier[row.supplier_id] ||= []).push(mapTxn(row));
    const suppliers = suppliersR.rows.map((x) => ({ ...mapClientBase(x), txns: txnsBySupplier[x.id] || [] }));
    const cash = cashR.rows.map(mapCash);
    const personal = personalR.rows.map(mapPersonal);
    return { products, clients, suppliers, cash, personal };
}

/* ---------------- reset ---------------- */
async function resetAll() {
    await ensureSchema();
    const p = getPool();
    await p.query('TRUNCATE invoice_items, invoices, payments, clients, products CASCADE');
    const defaults = [
        { name: 'جبنة ثلاجة 8ك', price: 540 },
        { name: 'جبنة كيري 1ك', price: 50 },
        { name: 'قشطة 1ك', price: 80 },
    ];
    for (const d of defaults) await createProduct(d);
}

module.exports = {
    ping,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    createClient,
    updateClient,
    deleteClient,
    createInvoice,
    deleteInvoice,
    createPayment,
    deletePayment,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createSupplierTxn,
    deleteSupplierTxn,
    createCashEntry,
    deleteCashEntry,
    createPersonalEntry,
    deletePersonalEntry,
    getFullState,
    resetAll,
};
