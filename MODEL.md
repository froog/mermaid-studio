# MODEL.md — Multi-Provider Model Selection, Auth & API Key Management

## Overview

Add multi-user authentication, provider/model selection, and secure per-user API key storage to Mermaid Studio. The editor works fully without an account (diagrams saved to `localStorage`), but AI features require login so API keys can be persisted server-side.

---

## Architecture

```
Browser ──► Node server
              ├── POST /api/auth/signup    ──► users.json (hashed passwords)
              ├── POST /api/auth/login     ──► session token cookie
              ├── GET  /api/auth/me        ──► check session
              ├── POST /api/auth/logout    ──► clear session
              ├── POST /api/keys           ──► keys.json (encrypted, keyed by username)
              ├── GET  /api/keys           ──► list stored providers for user
              ├── DELETE /api/keys/:provider
              └── POST /api/messages       ──► decrypt user's key ──► Vendor API
```

- Editor features (code editing, diagram preview, examples, export) work with no account — all client-side
- AI chat requires login — server looks up the user's API key to proxy the request
- Passwords hashed with scrypt, API keys encrypted with AES-256-GCM, both keyed by username

---

## 1. Authentication

### 1a. Login / Signup Dialog

**Location**: A "Sign in" button inside the Chat pane header (next to the "AI ASSISTANT" title). When not logged in, the chat input area shows a disabled state with the message: "Sign in to use AI features".

**Dialog**: A single modal that handles both signup and login:
- **Username** (text input) — the key used to store/retrieve credentials and API keys
- **Password** (password input)
- **Submit button** — label toggles between "Sign In" and "Create Account"
- **Toggle link** — "Don't have an account? Create one" / "Already have an account? Sign in"
- **Error display** — inline, below the form (e.g. "Username taken", "Wrong password")

The dialog uses the same dark theme as the rest of the app. No email, no recovery — simple local credentials.

### 1b. Auth State in UI

**Logged out**:
- Editor pane: fully functional
- Preview pane: fully functional
- Chat pane: input disabled, "Sign in to use AI features" message, Sign In button in header
- Settings panel: provider/model picker visible (saved to `localStorage`), API key fields hidden

**Logged in**:
- Chat pane: fully functional
- Header shows username + "Sign out" link (replaces "Sign in" button)
- Settings panel: API key fields visible, scoped to the logged-in user

### 1c. Session Management

- On successful login/signup, server sets an `httpOnly`, `SameSite=Strict` cookie: `session=<token>`
- Token: `crypto.randomBytes(32).toString('hex')`
- Server stores active sessions in memory: `{ token: username }` map
- Sessions survive server restart only if you implement optional persistence (not required for v1)
- Client calls `GET /api/auth/me` on page load to check session status → returns `{ "username": "alice" }` or `401`
- Logout: `POST /api/auth/logout` → clears cookie, removes session from map

---

## 2. Server Endpoints — Auth

#### `POST /api/auth/signup`
- Body: `{ "username": "alice", "password": "..." }`
- Validate: username 3-32 chars, alphanumeric + underscore only; password 8+ chars
- Hash password with `crypto.scryptSync(password, salt, 64)` where salt is `crypto.randomBytes(16)`
- Store in `users.json`: `{ "alice": { "hash": "...", "salt": "..." } }`
- If username exists → `409 { "error": "Username taken" }`
- On success → set session cookie, return `{ "username": "alice" }`

#### `POST /api/auth/login`
- Body: `{ "username": "alice", "password": "..." }`
- Look up user in `users.json`, hash provided password with stored salt, compare
- Match → set session cookie, return `{ "username": "alice" }`
- No match → `401 { "error": "Invalid username or password" }`

#### `GET /api/auth/me`
- Read session cookie, look up in sessions map
- Valid → `{ "username": "alice" }`
- Invalid/missing → `401 { "error": "Not authenticated" }`

#### `POST /api/auth/logout`
- Clear session cookie, remove from sessions map
- Return `{ "ok": true }`

---

## 3. Settings UI

Slide-out settings panel (gear icon in the top bar). Three sections:

### 3a. Provider + Model Picker

Dropdown or card-style selector. Default: Anthropic / Sonnet 4.6 (`claude-sonnet-4-6`). Saved to `localStorage` — works without login.

Each model is shown to the user with a friendly display name; the model ID sent to the vendor API is in parens.

| Provider | Models (display name → API id) | API Base URL | Auth Header |
|----------|--------------------------------|--------------|-------------|
| Anthropic | Opus 4.7 (`claude-opus-4-7`), Sonnet 4.6 (`claude-sonnet-4-6`), Haiku 4.5 (`claude-haiku-4-5-20251001`) | https://api.anthropic.com/v1/messages | `x-api-key` + `anthropic-version: 2023-06-01` |
| OpenAI | GPT-5 (`gpt-5`), GPT-5 mini (`gpt-5-mini`), GPT-4.1 (`gpt-4.1`), o4-mini (`o4-mini`), o3 (`o3`) | https://api.openai.com/v1/chat/completions | `Authorization: Bearer <key>` |
| Google | Gemini 2.5 Pro (`gemini-2.5-pro`), Gemini 2.5 Flash (`gemini-2.5-flash`), Gemini 2.0 Flash (`gemini-2.0-flash`) | https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent | `?key=<key>` (query param) |
| Mistral | Mistral Large 2 (`mistral-large-latest`), Mistral Medium 3 (`mistral-medium-latest`), Codestral (`codestral-latest`) | https://api.mistral.ai/v1/chat/completions | `Authorization: Bearer <key>` |
| DeepSeek | DeepSeek V3 (`deepseek-chat`), DeepSeek R1 (`deepseek-reasoner`) | https://api.deepseek.com/v1/chat/completions | `Authorization: Bearer <key>` |
| xAI | Grok 4 (`grok-4`), Grok 3 (`grok-3`), Grok 3 mini (`grok-3-mini`) | https://api.x.ai/v1/chat/completions | `Authorization: Bearer <key>` |
| Cohere | Command A (`command-a-03-2025`) | https://api.cohere.com/v2/chat | `Authorization: Bearer <key>` |
| Meta (via Groq) | Llama 4 Maverick (`meta-llama/llama-4-maverick-17b-128e-instruct`), Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) | https://api.groq.com/openai/v1/chat/completions | `Authorization: Bearer <key>` |
| OpenRouter | Free-form model field (e.g. `anthropic/claude-sonnet-4.5`, `openai/gpt-5`, `google/gemini-2.5-pro`); pre-populated suggestion list. One key, hundreds of models. | https://openrouter.ai/api/v1/chat/completions | `Authorization: Bearer <key>` (+ optional `HTTP-Referer`, `X-Title`) |

Model IDs above reflect the lineup as of May 2026 and may need to be updated as vendors release new versions; the model picker is data-driven so updates are a one-line change in `providers/index.js`.

### 3b. Custom Endpoint

Fields:
- **Base URL** (text input) — e.g. `http://localhost:11434/v1/chat/completions`
- **Model string** (text input) — e.g. `my-fine-tune:latest`
- **API key** (password input) — optional for local models
- **OpenAI-compatible** (toggle, default on) — when on, use OpenAI chat completions request format; when off, show an additional **custom headers** JSON field
- Use case: Ollama, vLLM, LM Studio, LocalAI, Together, any OpenAI-compatible host

### 3c. Agent System Prompt

Editable textarea pre-filled with the current Mermaid assistant prompt. Users can customize or replace entirely. Persisted in `localStorage`.

---

## 4. API Key Storage (Server-Side, Per-User)

### Data Structure

`keys.json` is keyed by username:

```json
{
  "alice": {
    "anthropic": { "encrypted": "...", "iv": "...", "tag": "..." },
    "openai": { "encrypted": "...", "iv": "...", "tag": "..." }
  },
  "bob": {
    "anthropic": { "encrypted": "...", "iv": "...", "tag": "..." }
  }
}
```

For custom endpoints, use the base URL as the provider key:
```json
{
  "alice": {
    "http://localhost:11434": { "encrypted": "...", "iv": "...", "tag": "..." }
  }
}
```

### Endpoints (all require valid session cookie)

#### `POST /api/keys`
- Body: `{ "provider": "anthropic", "apiKey": "sk-ant-..." }`
- Server resolves username from session cookie
- Encrypts `apiKey` with AES-256-GCM using server-side secret
- Stores under `keys.json[username][provider]`
- Returns: `{ "ok": true }`
- No session → `401`

#### `GET /api/keys`
- Returns provider names for the logged-in user (never the keys)
- Response: `{ "providers": ["anthropic", "openai"] }`
- No session → `401`

#### `DELETE /api/keys/:provider`
- Removes `keys.json[username][provider]`
- No session → `401`

### Encryption

```
SECRET = process.env.ENCRYPTION_SECRET || crypto.randomBytes(32)
```

- If `ENCRYPTION_SECRET` env var is not set, generate on first run, write to `.env`
- Use `crypto.createCipheriv('aes-256-gcm', secret, iv)` / `createDecipheriv` for encrypt/decrypt
- Same secret for all users — isolation is by username key in `keys.json`

---

## 5. Proxy Adapter Layer

### `POST /api/messages` (requires valid session)

Request body from client:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "system": "You are a Mermaid diagram assistant...",
  "messages": [
    { "role": "user", "content": "Create a flowchart for CI/CD" }
  ]
}
```

Server-side flow:
1. Validate session cookie → resolve username
2. Read `provider` from request body
3. Decrypt `keys.json[username][provider]` → plaintext API key
4. If no key found → `400 { "error": "No API key stored for this provider. Add one in Settings." }`
5. Pass to the provider adapter: `buildRequest(payload, apiKey)` → `{ url, headers, body }`
6. Forward to vendor API
7. Normalize response via `parseResponse(data)` → `{ "content": "..." }`

### Adapters

Each adapter exports: `{ buildRequest(payload, apiKey) → { url, headers, body }, parseResponse(data) → string }`

**OpenAI-compatible** (OpenAI, Mistral, DeepSeek, xAI, Groq, OpenRouter, custom):
- Wraps `system` as `{ role: "system", content: system }` prepended to messages
- Response: `data.choices[0].message.content`

**Anthropic**:
- Uses `system` as top-level field, `messages` array
- Response: `data.content.map(b => b.text).join('\n')`

**Google**:
- Converts messages to `contents` array with `parts`
- System prompt in `systemInstruction`
- API key as query param, not header
- Response: `data.candidates[0].content.parts[0].text`

**Cohere**:
- Converts to `message` (last user msg) + `chat_history` + `preamble` (system)
- Response: `data.text`

Keep adapters in `providers/` folder, one file per provider, with `index.js` mapping provider name → adapter.

---

## 6. UI State & Persistence

| Data | Storage | Requires Login |
|------|---------|----------------|
| Mermaid code (current diagram) | `localStorage` | No |
| Selected provider + model | `localStorage` | No |
| Agent system prompt | `localStorage` | No |
| Custom endpoint config | `localStorage` | No |
| Chat history | In-memory | No (but sending requires login) |
| API keys | Server `keys.json` per user | Yes |
| User credentials | Server `users.json` | N/A |

On page load:
1. Read provider/model/prompt from `localStorage`
2. Call `GET /api/auth/me` to check session
3. If logged in → call `GET /api/keys` to check stored keys, enable chat
4. If not logged in → show "Sign in" button, disable chat input

---

## 7. File Structure (Target)

```
mermaid-studio/
├── server.js              # Main server — routing, static serving, auth, key management
├── users.json             # Auto-created, gitignored — usernames + hashed passwords
├── keys.json              # Auto-created, gitignored — encrypted API keys per user
├── .env                   # Auto-created, gitignored — ENCRYPTION_SECRET
├── .gitignore             # users.json, keys.json, .env
├── providers/
│   ├── index.js           # Provider registry + adapter lookup + model lists
│   ├── anthropic.js       # Anthropic adapter
│   ├── openai.js          # OpenAI-compatible adapter (OpenAI, Mistral, DeepSeek, xAI, Groq, OpenRouter, custom)
│   ├── google.js          # Gemini adapter
│   └── cohere.js          # Cohere adapter
├── mermaid-studio.html    # Frontend — editor, preview, chat, auth dialog, settings panel
└── README.md
```

---

## 8. Constraints

- Zero npm dependencies — Node built-ins only (`http`, `https`, `crypto`, `fs`, `path`)
- Single `node server.js` to start — no build step
- `users.json`, `keys.json`, and `.env` must be in `.gitignore`
- All vendor API calls and credential storage server-side only
- Passwords hashed with scrypt (not bcrypt — no npm deps)
- API keys encrypted with AES-256-GCM
- Editor/preview fully functional without login — only AI chat requires auth
- Fail gracefully: missing key → prompt in settings, not silent failure
- Provider list is data-driven — adding a model should not require new adapter logic if it's OpenAI-compatible
- No email, no password recovery — this is a local/small-team tool, not a SaaS
