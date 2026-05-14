# Mermaid Studio

A minimal browser-based studio for authoring and previewing [Mermaid](https://mermaid.js.org/) diagrams, with AI-assisted generation.

- Live editor + preview + AI chat in one window.
- Easily connect to your chosen LLM
- Right-click any node/edge/subgraph to rename, reshape, or AI-transform it.
- Zero npm deps, data stored as files, single node server, runs anywhere.

The editor and preview work fully without an account. AI features require signing up locally so your API keys can be stored encrypted on the server.

## Requirements

- Node.js
- Optional: An API key for at least one supported provider
- Optional: To run detached, or in prod, a tool like pm

## Run

```sh
node server/server.js
```

Then open <http://localhost:3000>. On first run it generates `.env` with an `ENCRYPTION_SECRET` used to encrypt stored API keys.

To run detached, or in production use a tool like [PM2](https://github.com/Unitech/pm2)

```sh
npm install pm2 -g
pm2 start server/server.js
```

## HTTPS

Set `SSL_CERT` and `SSL_KEY` to the paths of your certificate and private key files. The server starts in HTTPS mode automatically; without them it falls back to HTTP.

```sh
SSL_CERT=/etc/letsencrypt/live/yourdomain.com/fullchain.pem \
SSL_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem \
node server/server.js
```

With PM2, set them in your environment or a [PM2 ecosystem file](https://pm2.keymetrics.io/docs/usage/application-declaration/) so they persist across restarts.

To obtain a free certificate with [Let's Encrypt](https://letsencrypt.org/):

```sh
sudo certbot certonly --standalone -d yourdomain.com
```

Certbot renews certificates automatically. Configure a renewal hook to restart the server afterwards so it picks up the new cert.

## First-time setup

1. Click **Sign in** in the chat pane and create an account (local — username + password).
2. Open **Settings** (⚙ in the top bar), pick a provider and model.
3. Paste the API key for that provider. It's encrypted with AES-256-GCM and stored under your username in `keys.json`.
4. Send a message in chat.

You can switch providers or models at any time. Keys are stored per provider, per user.

## Providers

Anthropic · OpenAI · Google · Mistral · DeepSeek · xAI · Cohere · Meta (via Groq) · OpenRouter · Custom (any OpenAI-compatible host: Ollama, vLLM, LM Studio, etc.)

The model picker is data-driven — see `server/providers/index.js` to add or update model IDs.

## Files

- `server/server.js` — HTTP server: static files, auth, encrypted key storage, provider proxy.
- `server/providers/` — adapters per provider (`anthropic.js`, `openai.js`, `google.js`, `cohere.js`) and the registry.
- `client/index.html` / `client/index.css` — markup and styles.
- `client/js/` — client modules (editor, preview, chat, auth, settings, persistence).
- `data/users.json` — auto-created, gitignored. Username + scrypt-hashed password.
- `data/keys.json` — auto-created, gitignored. AES-256-GCM-encrypted API keys per user.
- `.env` — auto-created, gitignored. Holds `ENCRYPTION_SECRET`.

## Demo mode

Share a URL that auto-logs in visitors as a pre-created `demo` user:

```
https://your-host/?demo=<password>
```

The value of the `demo` query parameter is used as the password for the `demo` account. To set it up:

1. Sign up normally with username `demo` and a password of your choosing (e.g. a UUID).
2. Share `/?demo=<that-password>` with whoever should have demo access.

Visitors who open the link are logged in automatically. If the password is wrong or the `demo` account doesn't exist, they arrive logged out with no error shown.

The password travels in the URL — treat it as a low-privilege shared secret, not a user credential.

## Constraints

- Zero npm dependencies — Node built-ins only.
- All vendor API calls and credential storage happen server-side; the browser never sees your raw API keys.
- Sessions are kept in memory and reset on server restart (you'll need to sign in again).
- No email, no password recovery — this is a local/small-team tool.
