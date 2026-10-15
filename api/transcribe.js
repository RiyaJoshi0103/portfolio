// Speech-to-text for the chatbot mic (Vercel: /api/transcribe).
// Used when the browser has no built-in speech recognition (Firefox, Brave, some Safari/Edge setups).
// The page records a short clip and posts the raw audio here; Groq Whisper turns it into text.

const MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Voice is not configured' });

  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!type.startsWith('audio/')) return res.status(415).json({ error: 'Expected audio' });

  let audio;
  try { audio = await readBody(req); } catch (e) { return res.status(413).json({ error: 'Recording too long' }); }
  if (!audio.length) return res.status(400).json({ error: 'Empty recording' });

  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), 'question.' + ext);
  form.append('model', MODEL);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form
    });
    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => '');
      console.error('Groq STT error', groqRes.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'Upstream error' });
    }
    const data = await groqRes.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text: String(data.text || '').trim() });
  } catch (err) {
    console.error('Transcribe failed', err);
    return res.status(502).json({ error: 'Upstream error' });
  }
};
