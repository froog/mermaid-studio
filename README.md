# Mermaid Studio

A browser-based studio for authoring and previewing [Mermaid](https://mermaid.js.org/) diagrams, with AI-assisted generation via [OpenRouter](https://openrouter.ai/).

The app is a single HTML file served by a tiny Node.js proxy that forwards requests to OpenRouter's chat completions API (so your API key stays out of the browser).

## Requirements

- Node.js (no npm dependencies — uses only built-ins)
- An OpenRouter API key

## Run

```sh
OPENROUTER_API_KEY=sk-or-... node server.js
```

Then open <http://localhost:3000>.

## Files

- `server.js` — minimal HTTP server. Serves the HTML and proxies `POST /api/messages` to `https://openrouter.ai/api/v1/chat/completions`.
- `mermaid-studio.html` — the full client app (editor + preview).

## Changing the model

The model is hardcoded as `anthropic/claude-sonnet-4.5` in `mermaid-studio.html`. Swap it for any [OpenRouter model slug](https://openrouter.ai/models) (e.g. `openai/gpt-4o`, `google/gemini-2.5-pro`).
