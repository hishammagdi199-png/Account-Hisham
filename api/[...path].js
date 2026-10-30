// api/[...path].js
// دالة Vercel واحدة بتستقبل كل مسارات /api/* وتبعتها للموجّه المشترك.
/*const { route } = require('../backend/router');

module.exports = async (req, res) => {
  const pin = req.headers['x-app-pin'] || '';
  const raw = req.query.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const r = await route(req.method, segments, req.body || {}, pin);
  res.status(r.status).json(r.body);
};
*/
/*const { route } = require('../backend/router');

module.exports = async(req, res) => {
    const pin = req.headers['x-app-pin'] || '';

    // استخراج المسار بعد /api/
    const path = req.url.replace(/^\/api\/?/, '').split('?')[0];
    const segments = path ? path.split('/').filter(Boolean) : [];

    const r = await route(req.method, segments, req.body || {}, pin);
    res.status(r.status).json(r.body);
};*/
const { route } = require('../backend/router');

module.exports = async(req, res) => {
    try {
        const pin = req.headers['x-app-pin'] || '';

        // استخراج المسار بشكل يدوي لضمان الدقة على Vercel
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname.replace(/^\/api\/?/, '');
        const segments = path ? path.split('/').filter(Boolean) : [];

        const r = await route(req.method, segments, req.body || {}, pin);
        res.status(r.status).json(r.body);
    } catch (error) {
        console.error("Vercel API Error:", error);
        res.status(500).json({ error: 'Server Error', message: error.message });
    }
};