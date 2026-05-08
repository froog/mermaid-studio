# Mermaid Studio

A browser-based studio for authoring and previewing [Mermaid](https://mermaid.js.org/) diagrams, with AI-assisted generation via the Anthropic API.

The app is a single HTML file served by a tiny Node.js proxy that forwards requests to the Anthropic Messages API (so your API key stays out of the browser).

## Requirements

- Node.js (no npm dependencies — uses only built-ins)
- An Anthropic API key

## Run

```sh
ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Then open <http://localhost:3000>.

## Files

- `server.js` — minimal HTTP server. Serves the HTML and proxies `POST /api/messages` to `https://api.anthropic.com/v1/messages`.
- `mermaid-studio.html` — the full client app (editor + preview).
