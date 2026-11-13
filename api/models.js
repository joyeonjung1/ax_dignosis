// 진단용: 이 API 키로 쓸 수 있는 Gemini 모델 이름만 보여준다(키 값은 보여주지 않는다).
module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY 환경변수가 없습니다' });
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ status: r.status, error: (data.error && data.error.message) || '' });
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
    return res.status(200).json({ current: process.env.GEMINI_MODEL || '', models: names });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
};
