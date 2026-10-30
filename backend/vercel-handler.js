// backend/vercel-handler.js
// المنطق المشترك لدوال Vercel (api/index.js و api/[...path].js).
// المسار بيجي من ?p=... (لما vercel.json يعمل rewrite) أو من الـ URL نفسه.
module.exports = async (req, res) => {
    try {
        // الـ require جوه الـ try عشان لو فيه مشكلة تظهر رسالتها بدل 500 عامة
        const { route } = require('./router');
        const pin = req.headers['x-app-pin'] || '';
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        let path = url.searchParams.has('p')
            ? url.searchParams.get('p')
            : url.pathname.replace(/^\/api\/?/, '');
        if (path === 'index') path = '';
        const segments = path ? path.split('/').filter(Boolean) : [];
        const r = await route(req.method, segments, req.body || {}, pin);
        res.status(r.status).json(r.body);
    } catch (error) {
        console.error('Vercel API Error:', error);
        res.status(500).json({ error: 'Server Error', message: String(error && error.message || error) });
    }
};
