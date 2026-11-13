// 진단용(임시): 모델별 응답 속도를 잰다. 확인이 끝나면 삭제합니다.
module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'no key' });
  const q = req.query || {};
  const model = String(q.model || process.env.GEMINI_MODEL || '');
  if (!/^gemini-[a-z0-9.\-]+$/.test(model)) return res.status(400).json({ error: 'bad model' });
  const level = String(q.level || '');
  const gc = { maxOutputTokens: 200 };
  if (level) gc.thinkingConfig = { thinkingLevel: level };
  const t0 = Date.now();
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '안녕이라고만 답하세요.' }] }], generationConfig: gc }),
      signal: AbortSignal.timeout(40000),
    });
    const body = await r.text();
    let out = body.slice(0, 200);
    try { const j = JSON.parse(body); out = (j.error && j.error.message) || JSON.stringify(j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts); } catch (e) {}
    return res.status(200).json({ model, level, status: r.status, ms: Date.now() - t0, out: String(out).slice(0, 200) });
  } catch (e) {
    return res.status(200).json({ model, level, error: String(e), ms: Date.now() - t0 });
  }
};
