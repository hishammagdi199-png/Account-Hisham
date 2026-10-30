// api/[...path].js
// دالة Vercel واحدة بتستقبل كل مسارات /api/* وتبعتها للموجّه المشترك.
module.exports = async (req, res) => {
    try {
        // الـ require جوه الـ try عشان لو فيه مشكلة (مكتبة ناقصة مثلًا) تظهر رسالتها بدل 500 عامة
        const { route } = require('../backend/router');
        const pin = req.headers['x-app-pin'] || '';
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname.replace(/^\/api\/?/, '');
        const segments = path ? path.split('/').filter(Boolean) : [];
        const r = await route(req.method, segments, req.body || {}, pin);
        res.status(r.status).json(r.body);
    } catch (error) {
        console.error('Vercel API Error:', error);
        res.status(500).json({ error: 'Server Error', message: String(error && error.message || error) });
    }
};
