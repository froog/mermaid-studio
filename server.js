const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const providers = require('./providers');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'users.json');
const KEYS_FILE = path.join(ROOT, 'keys.json');
const PREFS_FILE = path.join(ROOT, 'prefs.json');
const ENV_FILE = path.join(ROOT, '.env');

// ─── Env (.env) ─────────────────────────────────────────────────────────────
loadEnvFile();
ensureEncryptionSecret();

const ENCRYPTION_SECRET = Buffer.from(process.env.ENCRYPTION_SECRET, 'hex');

// ─── In-memory session map: token → username ────────────────────────────────
const sessions = new Map();

// ─── Boot ───────────────────────────────────────────────────────────────────
async function handler(req, res) {
  try {
    if (await routeApi(req, res)) return;
    if (routeStatic(req, res)) return;
    send(res, 404, 'Not found');
  } catch (err) {
    console.error('Unhandled error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

const SSL_CERT = process.env.SSL_CERT;
const SSL_KEY  = process.env.SSL_KEY;

let server;
if (SSL_CERT && SSL_KEY) {
  server = https.createServer({ cert: fs.readFileSync(SSL_CERT), key: fs.readFileSync(SSL_KEY) }, handler);
  server.listen(PORT, () => console.log(`\n  ⚡ Mermaid Studio running at https://localhost:${PORT}\n`));
} else {
  server = http.createServer(handler);
  server.listen(PORT, () => console.log(`\n  ⚡ Mermaid Studio running at http://localhost:${PORT}\n`));
}

// ─── API routing ────────────────────────────────────────────────────────────
async function routeApi(req, res) {
  const url = req.url;

  if (req.method === 'POST' && url === '/api/auth/signup') return handleSignup(req, res);
  if (req.method === 'POST' && url === '/api/auth/login')  return handleLogin(req, res);
  if (req.method === 'GET'  && url === '/api/auth/me')     return handleMe(req, res);
  if (req.method === 'POST' && url === '/api/auth/logout') return handleLogout(req, res);

  if (req.method === 'GET'    && url === '/api/providers') {
    sendJson(res, 200, providers.publicCatalog());
    return true;
  }

  if (req.method === 'POST'   && url === '/api/keys') return handlePostKey(req, res);
  if (req.method === 'GET'    && url === '/api/keys') return handleListKeys(req, res);
  if (req.method === 'DELETE' && url.startsWith('/api/keys/')) return handleDeleteKey(req, res);

  if (req.method === 'GET' && url === '/api/prefs') return handleGetPrefs(req, res);
  if (req.method === 'PUT' && url === '/api/prefs') return handlePutPrefs(req, res);

  if (req.method === 'POST' && url === '/api/messages')    return handleMessages(req, res);

  return false;
}

// ─── Auth handlers ──────────────────────────────────────────────────────────
async function handleSignup(req, res) {
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    sendJson(res, 400, { error: 'Username must be 3-32 chars, letters/digits/underscore only' });
    return true;
  }
  if (password.length < 8) {
    sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    return true;
  }

  const users = readJson_(USERS_FILE);
  if (users[username]) {
    sendJson(res, 409, { error: 'Username taken' });
    return true;
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  users[username] = { hash: hash.toString('hex'), salt: salt.toString('hex') };
  writeJson_(USERS_FILE, users);

  startSession(res, username);
  sendJson(res, 200, { username });
  return true;
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  const users = readJson_(USERS_FILE);
  const u = users[username];
  if (!u) {
    sendJson(res, 401, { error: 'Invalid username or password' });
    return true;
  }

  const salt = Buffer.from(u.salt, 'hex');
  const expected = Buffer.from(u.hash, 'hex');
  const got = crypto.scryptSync(password, salt, 64);
  if (!crypto.timingSafeEqual(got, expected)) {
    sendJson(res, 401, { error: 'Invalid username or password' });
    return true;
  }

  startSession(res, username);
  sendJson(res, 200, { username });
  return true;
}

function handleMe(req, res) {
  const username = currentUser(req);
  if (!username) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return true;
  }
  sendJson(res, 200, { username });
  return true;
}

function handleLogout(req, res) {
  const token = parseSessionCookie(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  sendJson(res, 200, { ok: true });
  return true;
}

// ─── API key handlers ──────────────────────────────────────────────────────
async function handlePostKey(req, res) {
  const username = currentUser(req);
  if (!username) { sendJson(res, 401, { error: 'Not authenticated' }); return true; }

  const body = await readJson(req);
  const provider = String(body.provider || '').trim();
  const apiKey = String(body.apiKey || '');
  if (!provider || !apiKey) {
    sendJson(res, 400, { error: 'Missing provider or apiKey' });
    return true;
  }

  const all = readJson_(KEYS_FILE);
  if (!all[username]) all[username] = {};
  all[username][provider] = encryptKey(apiKey);
  writeJson_(KEYS_FILE, all);

  sendJson(res, 200, { ok: true });
  return true;
}

function handleListKeys(req, res) {
  const username = currentUser(req);
  if (!username) { sendJson(res, 401, { error: 'Not authenticated' }); return true; }

  const all = readJson_(KEYS_FILE);
  const providers = Object.keys(all[username] || {}).sort();
  sendJson(res, 200, { providers });
  return true;
}

function handleDeleteKey(req, res) {
  const username = currentUser(req);
  if (!username) { sendJson(res, 401, { error: 'Not authenticated' }); return true; }

  const provider = decodeURIComponent(req.url.slice('/api/keys/'.length));
  if (!provider) {
    sendJson(res, 400, { error: 'Missing provider' });
    return true;
  }
  const all = readJson_(KEYS_FILE);
  if (all[username] && all[username][provider]) {
    delete all[username][provider];
    if (Object.keys(all[username]).length === 0) delete all[username];
    writeJson_(KEYS_FILE, all);
  }
  sendJson(res, 200, { ok: true });
  return true;
}

// ─── Preferences handlers ──────────────────────────────────────────────────
function handleGetPrefs(req, res) {
  const username = currentUser(req);
  if (!username) { sendJson(res, 401, { error: 'Not signed in' }); return true; }
  const all = readJson_(PREFS_FILE);
  sendJson(res, 200, all[username] || {});
  return true;
}

async function handlePutPrefs(req, res) {
  const username = currentUser(req);
  if (!username) { sendJson(res, 401, { error: 'Not signed in' }); return true; }
  const body = await readJson(req);
  const all = readJson_(PREFS_FILE);
  all[username] = body;
  writeJson_(PREFS_FILE, all);
  sendJson(res, 200, { ok: true });
}

// ─── Encryption (AES-256-GCM) ───────────────────────────────────────────────
function encryptKey(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_SECRET, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: enc.toString('hex'), iv: iv.toString('hex'), tag: tag.toString('hex') };
}
function decryptKey(record) {
  const iv = Buffer.from(record.iv, 'hex');
  const tag = Buffer.from(record.tag, 'hex');
  const enc = Buffer.from(record.encrypted, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_SECRET, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function getStoredKey(username, provider) {
  const all = readJson_(KEYS_FILE);
  const record = all[username] && all[username][provider];
  if (!record) return null;
  try { return decryptKey(record); }
  catch (err) { console.error('Failed to decrypt key:', err); return null; }
}

// ─── Messages proxy ─────────────────────────────────────────────────────────
async function handleMessages(req, res) {
  const username = currentUser(req);
  if (!username) {
    sendJson(res, 401, { error: 'Sign in to use AI features.' });
    return true;
  }

  const payload = await readJson(req);
  const provider = String(payload.provider || '').trim();
  const model = String(payload.model || '').trim();
  const system = `${providers.DEFAULT_SYSTEM_PROMPT}\n\n---\n\n${payload.system}`;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const max_tokens = Number(payload.max_tokens) || 1000;
  console.log(`[messages] provider=${provider} model=${model} messages=${messages.length} max_tokens=${max_tokens}`);
  if (!provider) { sendJson(res, 400, { error: 'Missing provider' }); return true; }
  if (!model)    { sendJson(res, 400, { error: 'Missing model' });    return true; }

  // Resolve adapter + API key
  let adapter, apiKey;
  if (provider === 'custom') {
    const cfg = payload.custom || {};
    if (!cfg.baseUrl) { sendJson(res, 400, { error: 'Custom endpoint missing Base URL' }); return true; }
    adapter = providers.customAdapter({
      baseUrl: cfg.baseUrl,
      openaiCompatible: cfg.openaiCompatible !== false,
      customHeaders: parseHeaders(cfg.headers),
    });
    apiKey = getStoredKey(username, 'custom') || '';
  } else {
    const p = providers.getProvider(provider);
    if (!p) { sendJson(res, 400, { error: `Unknown provider: ${provider}` }); return true; }
    apiKey = getStoredKey(username, provider);
    if (!apiKey) {
      sendJson(res, 400, { error: 'No API key stored for this provider. Add one in Settings.' });
      return true;
    }
    adapter = p.adapter;
  }

  // Build vendor request and forward
  let built;
  try {
    built = adapter.buildRequest({ model, system, messages, max_tokens }, apiKey);
  } catch (err) {
    console.error('[messages] build error', err.message);
    sendJson(res, 400, { error: `Failed to build request: ${err.message}` });
    return true;
  }

  console.log(`[messages] → ${built.url}`);
  forwardRequest(built, (err, statusCode, data) => {
    if (err) {
      console.error('[messages] network error', err.message);
      sendJson(res, 502, { error: err.message });
      return;
    }
    if (statusCode >= 400) {
      const detail = (data && (data.error?.message || data.error?.error?.message || data.error || data.message)) || `Upstream error ${statusCode}`;
      console.error(`[messages] ← ${statusCode}`, typeof detail === 'string' ? detail : JSON.stringify(detail));
      console.error('[messages] full response', JSON.stringify(data));
      sendJson(res, statusCode, { error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
      return;
    }
    let content;
    try { content = adapter.parseResponse(data); }
    catch (parseErr) {
      console.error('[messages] parse error', parseErr.message, JSON.stringify(data));
      sendJson(res, 502, { error: `Failed to parse response: ${parseErr.message}` });
      return;
    }
    console.log(`[messages] ← ${statusCode} ok, ${content?.length ?? '?'} chars`);
    sendJson(res, 200, { content });
  });
  return true;
}

function parseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function forwardRequest({ url, headers, body }, cb) {
  let parsed;
  try { parsed = new URL(url); } catch (e) { return cb(e); }
  const lib = parsed.protocol === 'https:' ? https : http;
  const opts = {
    method: 'POST',
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    headers,
  };
  const r = lib.request(opts, resp => {
    let buf = '';
    resp.on('data', c => buf += c);
    resp.on('end', () => {
      let data = null;
      try { data = JSON.parse(buf); } catch { data = buf; }
      cb(null, resp.statusCode, data);
    });
  });
  r.on('error', err => cb(err));
  r.setTimeout(120000, () => { r.destroy(new Error('Upstream request timed out')); });
  r.write(body);
  r.end();
}

// ─── Static file serving ────────────────────────────────────────────────────
function routeStatic(req, res) {
  if (req.method !== 'GET') return false;

  const STATIC = {
    '/':           { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.css':  { file: 'index.css',  type: 'text/css; charset=utf-8' },
    '/HELP.md':    { file: 'HELP.md',    type: 'text/markdown; charset=utf-8' },
  };
  const urlPath = req.url.split('?')[0];
  if (STATIC[urlPath]) {
    const { file, type } = STATIC[urlPath];
    serveFile(res, path.join(ROOT, file), type);
    return true;
  }
  if (urlPath.startsWith('/js/')) {
    const name = path.basename(urlPath);
    serveFile(res, path.join(ROOT, 'js', name), 'application/javascript; charset=utf-8');
    return true;
  }
  return false;
}

function serveFile(res, filePath, type) {
  fs.readFile(filePath, (err, data) => {
    if (err) { send(res, 404, 'File not found'); return; }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

// ─── Session helpers ────────────────────────────────────────────────────────
function startSession(res, username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, username);
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
}

function parseSessionCookie(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

function currentUser(req) {
  const token = parseSessionCookie(req);
  if (!token) return null;
  return sessions.get(token) || null;
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ─── File-backed JSON helpers ───────────────────────────────────────────────
function readJson_(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (err) {
    console.error(`Failed to read ${file}:`, err);
    return {};
  }
}
function writeJson_(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// ─── Env file management ────────────────────────────────────────────────────
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
function ensureEncryptionSecret() {
  if (process.env.ENCRYPTION_SECRET) return;
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_SECRET = secret;
  const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const sep = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(ENV_FILE, `${existing}${sep}ENCRYPTION_SECRET=${secret}\n`);
  console.log('Generated new ENCRYPTION_SECRET → .env');
}
