const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error('\n  ✗ Missing OPENROUTER_API_KEY\n');
  console.error('  Run with:');
  console.error('    OPENROUTER_API_KEY=sk-or-... node server.js\n');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // ─── Proxy API calls ───
  if (req.method === 'POST' && req.url === '/api/messages') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const apiReq = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Mermaid Studio',
        },
      }, apiRes => {
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
        apiRes.pipe(res);
      });

      apiReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });

      apiReq.write(body);
      apiReq.end();
    });
    return;
  }

  // ─── Serve static files ───
  const STATIC = {
    '/':           { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.css':  { file: 'index.css',  type: 'text/css; charset=utf-8' },
    '/HELP.md':    { file: 'HELP.md',    type: 'text/markdown; charset=utf-8' },
  };
  if (req.method === 'GET' && STATIC[req.url]) {
    const { file, type } = STATIC[req.url];
    fs.readFile(path.join(__dirname, file), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
    return;
  }

  // ─── Serve js/ modules ───
  if (req.method === 'GET' && req.url.startsWith('/js/')) {
    const name = path.basename(req.url);
    const filePath = path.join(__dirname, 'js', name);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  ⚡ Mermaid Studio running at http://localhost:${PORT}\n`);
});
