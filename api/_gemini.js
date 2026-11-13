// Gemini 호출과 공통 도우미 (서버에서만 실행됩니다)
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// 아주 단순한 요청 제한(서버가 깨어 있는 동안만 유효한 보조 장치)
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const now = Date.now();
  const k = key + ':' + ip;
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  return (f ? String(f).split(',')[0].trim() : req.socket && req.socket.remoteAddress) || 'unknown';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const c of req) raw += c;
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}

async function gemini({ system, contents, json, maxOutputTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('no key'), { code: 'not_granted' });
  const generationConfig = { maxOutputTokens: maxOutputTokens || 700, temperature: json ? 0.4 : 0.7 };
  if (json) generationConfig.responseMimeType = 'application/json';
  // 생각 수준: 환경변수 GEMINI_THINKING_LEVEL(low, high 등)이 있으면 그대로 쓰고,
  // 없으면 2.5 계열만 생각 시간을 꺼서 답을 빠르게 받는다
  const level = (process.env.GEMINI_THINKING_LEVEL || '').trim().toLowerCase();
  if (level) generationConfig.thinkingConfig = { thinkingLevel: level };
  else if (/2\.5-(flash|flash-lite)/.test(MODEL)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig,
    }),
  });
  if (r.status === 429) throw Object.assign(new Error('rate'), { code: 'rate_limited' });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('Gemini error', r.status, t.slice(0, 500));
    throw Object.assign(new Error('gemini'), { code: 'network' });
  }
  const data = await r.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) throw Object.assign(new Error('empty'), { code: 'empty_completion' });
  return text;
}

module.exports = { gemini, limited, clientIp, readBody };
