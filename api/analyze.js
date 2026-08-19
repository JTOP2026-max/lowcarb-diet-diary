export default async function handler(req, res) {
  const allowedOrigins = new Set([
    'https://jtop2026-max.github.io',
    'https://JTOP2026-max.github.io'
  ]);
  const origin = req.headers.origin || '';
  if (allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, manualText = '', mealType = '餐點' } = req.body || {};
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: '缺少有效照片' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: '伺服器尚未設定 OPENAI_API_KEY' });
    }

    const prompt = `你是低碳飲食紀錄助手。請看這張${mealType}照片，先辨識可見食物，再根據使用者補充文字修正。\n使用者補充：${manualText || '無'}\n\n請只輸出 JSON，不要 Markdown，不要程式碼圍欄。格式：\n{\n  "foods": "用繁體中文列出你看見的食物，逗號分隔；不確定的要標註可能",\n  "score": 0-100,\n  "good": ["這餐做得好的地方，2-4點"],\n  "watch": ["可能不足或需要留意，2-4點"],\n  "next": ["下一餐具體建議，2-4點"],\n  "summary": "2-4句自然、像聊天的整體回饋",\n  "uncertain": ["照片看不清楚、需要使用者確認的項目"]\n}\n\n原則：不要假裝能精準秤重或精準算熱量；若份量不明要明講估算。以低碳與均衡為方向，不做疾病診斷，不要求極端節食。`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image, detail: 'auto' }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'OpenAI API 呼叫失敗' });
    }

    const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(502).json({ error: 'AI 回傳格式無法解析', raw: text });
      parsed = JSON.parse(match[0]);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err?.message || '伺服器錯誤' });
  }
}
