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
  // 같은 설정으로 한 번 더 시도하고(일시적인 과부하 대비), 예비 모델은 환경변수로 정했을 때만 쓴다
  const fallback = (process.env.GEMINI_FALLBACK_MODEL || '').trim();
  const attempts = [{ model: MODEL, level }, { model: MODEL, level }];
  if (fallback && fallback !== MODEL) attempts.push({ model: fallback, level: '' });

  let last = null;
  const errs = [];
  for (const a of attempts) {
    let r;
    try {
      r = await callOnce({ key, model: a.model, level: a.level, system, contents, json, maxOutputTokens, timeoutMs: json ? 25000 : 16000 });
    } catch (e) {
      console.error('Gemini timeout/network', a.model, a.level, String(e));
      errs.push(a.model + (a.level ? '/' + a.level : '') + ' 응답없음');
      last = { status: 0, msg: a.model + (a.level ? '/' + a.level : '') + ' → 응답 없음(' + (e && e.name) + ')' };
      continue;
    }
    if (r.status === 429) throw Object.assign(new Error('rate'), { code: 'rate_limited' });
    if (r.ok) {
      const data = await r.json();
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || '').join('').trim();
      if (text) return text;
      last = { status: 200, msg: '빈 응답 (' + ((data.promptFeedback || {}).blockReason || (((data.candidates || [])[0] || {}).finishReason) || '이유 없음') + ')' };
      continue;
    }
    const t = await r.text().catch(() => '');
    let msg = t.slice(0, 300);
    try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
    console.error('Gemini error', a.model, a.level, r.status, msg);
    errs.push(a.model + (a.level ? '/' + a.level : '') + ' ' + r.status + ' ' + String(msg).slice(0, 160));
    last = { status: r.status, msg: a.model + (a.level ? '/' + a.level : '') + ' → ' + r.status + ' ' + String(msg).slice(0, 200) };
    if (r.status === 401 || r.status === 403) break; // 키 문제는 다른 모델로도 안 풀린다
  }
  throw Object.assign(new Error('gemini'), { code: 'network', detail: errs.join(' | ') });
}

module.exports = { gemini, limited, clientIp, readBody };
