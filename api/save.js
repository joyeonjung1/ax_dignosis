const { limited, clientIp, readBody } = require('./_gemini');

// 구글 시트 저장: 화면이 보낸 진단서나 연락처를 구글 시트 연결 주소(Apps Script)로 넘긴다.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ code: 'bad_request' });
  const ip = clientIp(req);
  if (limited(ip, 'save', 20, 10 * 60 * 1000)) return res.status(429).json({ code: 'rate_limited' });

  const hook = process.env.SHEET_WEBHOOK_URL;
  if (!hook) return res.status(503).json({ code: 'not_granted' });

  const body = await readBody(req);
  const type = body.type === 'contact' ? 'contact' : body.type === 'diagnosis' ? 'diagnosis' : '';
  const id = typeof body.id === 'string' ? body.id.slice(0, 80) : '';
  if (!type || !id) return res.status(400).json({ code: 'bad_request' });

  const payload = { secret: process.env.SHEET_SECRET || '', type, id };
  if (type === 'contact') {
    const c = typeof body.contact === 'string' ? body.contact.trim().slice(0, 60) : '';
    if (!c) return res.status(400).json({ code: 'bad_request' });
    payload.contact = c;
  } else {
    payload.diag = body.diag && typeof body.diag === 'object' ? body.diag : {};
    payload.transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 20000) : '';
    if (JSON.stringify(payload).length > 120000) return res.status(413).json({ code: 'prompt_too_large' });
  }

  try {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await r.text();
    let ok = r.ok;
    try { ok = ok && JSON.parse(text).ok === true; } catch (e) { ok = false; }
    if (!ok) { console.error('sheet save failed', r.status, text.slice(0, 300)); return res.status(502).json({ code: 'network' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('sheet save error', e);
    return res.status(502).json({ code: 'network' });
  }
};
