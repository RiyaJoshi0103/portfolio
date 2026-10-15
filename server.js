// Local dev server: serves the site and runs api/chat.js with the key from .env.
// Usage: node server.js   ->   http://localhost:3000
// (On Vercel this file isn't used; set GROQ_API_KEY in the Vercel project settings.)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

// Re-read .env on every request so a new key works without restarting.
function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* no .env */ }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.json': 'application/json'
};

function vercelRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/transcribe') {
    loadEnv();
    delete require.cache[require.resolve('./api/transcribe.js')];
    require('./api/transcribe.js')(req, vercelRes(res));
    return;
  }

  if (url === '/api/chat') {
    loadEnv();
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      req.body = raw;
      delete require.cache[require.resolve('./api/chat.js')];
      require('./api/chat.js')(req, vercelRes(res));
    });
    return;
  }

  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  const base = path.basename(file);
  if (!file.startsWith(ROOT) || base.startsWith('.') || base === 'server.js') {
    res.statusCode = 404; return res.end('Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log(`Portfolio running at http://localhost:${PORT}`));
