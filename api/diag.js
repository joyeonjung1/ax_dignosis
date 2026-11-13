const { DIAG } = require('./_prompts');
const { gemini, limited, clientIp, readBody } = require('./_gemini');

// 진단서 만들기: 대화 기록 전체를 받아 진단서 JSON 하나를 돌려준다.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ code: 'bad_request' });
  const ip = clientIp(req);
  if (limited(ip, 'diag', 8, 10 * 60 * 1000)) return res.status(429).json({ code: 'rate_limited' });

  const body = await readBody(req);
  const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 20000) : '';
  if (transcript.length < 20) return res.status(400).json({ code: 'bad_request' });

  try {
    const text = await gemini({
      system: DIAG,
      contents: [{ role: 'user', parts: [{ text: '[대화 기록]\n' + transcript }] }],
      json: true,
      maxOutputTokens: 4000,
    });
    let data;
    try {
      data = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
    } catch (e) {
      return res.status(502).json({ code: 'invalid_json' });
    }
    return res.status(200).json({ data });
  } catch (e) {
    const code = e.code || 'network';
    return res.status(code === 'rate_limited' ? 429 : 502).json({ code, detail: e.detail || '' });
  }
};
