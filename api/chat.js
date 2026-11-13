const { RULES } = require('./_prompts');
const { gemini, limited, clientIp, readBody } = require('./_gemini');

// 질문 이어가기: 화면이 보낸 대화를 받아 다음 질문 하나를 돌려준다.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ code: 'bad_request' });
  const ip = clientIp(req);
  if (limited(ip, 'chat', 60, 10 * 60 * 1000)) return res.status(429).json({ code: 'rate_limited' });

  const body = await readBody(req);
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  if (!msgs.length || msgs.length > 40) return res.status(400).json({ code: 'bad_request' });

  const contents = [];
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return res.status(400).json({ code: 'bad_request' });
    }
    const text = m.content.slice(0, 2000);
    contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text }] });
  }
  // 대화는 사용자 발화로 시작해야 한다(첫 인사는 도우미 말이므로 안내 한 줄을 앞에 둔다)
  if (contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(사장님이 진단을 시작했습니다.)' }] });

  try {
    const text = await gemini({ system: RULES, contents, json: false, maxOutputTokens: 600 });
    return res.status(200).json({ text });
  } catch (e) {
    const code = e.code || 'network';
    return res.status(code === 'rate_limited' ? 429 : 502).json({ code, detail: e.detail || '' });
  }
};
