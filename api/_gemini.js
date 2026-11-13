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

async function callOnce({ key, model, level, system, contents, json, maxOutputTokens, timeoutMs }) {
  const generationConfig = { maxOutputTokens: maxOutputTokens || 700, temperature: json ? 0.4 : 0.7 };
  if (json) generationConfig.responseMimeType = 'application/json';
  // 생각 수준: level(low, high 등)이 있으면 그대로 쓰고, 없으면 2.5 계열만 생각 시간을 꺼서 빠르게 받는다
  if (level) generationConfig.thinkingConfig = { thinkingLevel: level };
  else if (/2\.5-(flash|flash-lite)/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig }),
    signal: AbortSignal.timeout(timeoutMs || 12000),
  });
}

async function gemini({ system, contents, json, maxOutputTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('no key'), { code: 'not_granted', detail: 'GEMINI_API_KEY 환경변수가 없습니다' });
  const level = (process.env.GEMINI_THINKING_LEVEL || '').trim().toLowerCase();
  // 정한 모델이 과부하일 때를 대비해 예비 모델을 차례로 시도한다(환경변수 GEMINI_FALLBACK_MODEL 로 바꿀 수 있고 쉼표로 여러 개 가능)
  const fallbacks = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite')
    .split(',').map((x) => x.trim()).filter((x) => x && x !== MODEL);
  const attempts = [MODEL].concat(fallbacks).map((m) => ({ model: m, level: /gemini-3/.test(m) ? level : '' }));

  let last = null;
  const errs = [];
  let hit429 = false;
  for (const a of attempts) {
    let r;
    try {
      r = await callOnce({ key, model: a.model, level: a.level, system, contents, json, maxOutputTokens, timeoutMs: json ? (a.model === MODEL ? 28000 : 20000) : (a.model === MODEL ? 14000 : 10000) });
    } catch (e) {
      console.error('Gemini timeout/network', a.model, a.level, String(e));
      errs.push(a.model + (a.level ? '/' + a.level : '') + ' 응답없음');
      last = { status: 0, msg: a.model + (a.level ? '/' + a.level : '') + ' → 응답 없음(' + (e && e.name) + ')' };
      continue;
    }
    if (r.ok) {
      const data = await r.json();
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || '').join('').trim();
      if (text) { if (a.model !== MODEL) console.warn('예비 모델로 응답함:', a.model); return { text, model: a.model }; }
      last = { status: 200, msg: '빈 응답 (' + ((data.promptFeedback || {}).blockReason || (((data.candidates || [])[0] || {}).finishReason) || '이유 없음') + ')' };
      continue;
    }
    const t = await r.text().catch(() => '');
    let msg = t.slice(0, 300);
    try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
    console.error('Gemini error', a.model, a.level, r.status, msg);
    errs.push(a.model + (a.level ? '/' + a.level : '') + ' ' + r.status + ' ' + String(msg).slice(0, 160));
    last = { status: r.status, msg: a.model + (a.level ? '/' + a.level : '') + ' → ' + r.status + ' ' + String(msg).slice(0, 200) };
    if (r.status === 429) hit429 = true;
    if (r.status === 401 || r.status === 403) break; // 키 문제는 다른 모델로도 안 풀린다
  }
  throw Object.assign(new Error('gemini'), { code: hit429 ? 'rate_limited' : 'network', detail: errs.join(' | ') });
}

module.exports = { gemini, limited, clientIp, readBody };
