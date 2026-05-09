// Provider registry. Each entry exposes:
//   - label:    UI display name
//   - models:   [{ id, label }] — empty array means "user-supplied" (e.g. custom)
//   - adapter:  { buildRequest(payload, apiKey) → {url, headers, body},
//                 parseResponse(data) → string }

const anthropic = require('./anthropic');
const google = require('./google');
const cohere = require('./cohere');
const { buildOpenAIRequest, parseOpenAIResponse } = require('./openai');

function openAICompatible(url, extraHeaders) {
  return {
    buildRequest: buildOpenAIRequest({ url, extraHeaders }),
    parseResponse: parseOpenAIResponse,
  };
}

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-opus-4-7',            label: 'Opus 4.7' },
      { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5' },
    ],
    adapter: anthropic,
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5',       label: 'GPT-5' },
      { id: 'gpt-5-mini',  label: 'GPT-5 mini' },
      { id: 'gpt-4.1',     label: 'GPT-4.1' },
      { id: 'o4-mini',     label: 'o4-mini' },
      { id: 'o3',          label: 'o3' },
    ],
    adapter: openAICompatible('https://api.openai.com/v1/chat/completions'),
  },
  google: {
    label: 'Google',
    models: [
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    adapter: google,
  },
  mistral: {
    label: 'Mistral',
    models: [
      { id: 'mistral-large-latest',  label: 'Mistral Large 2' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium 3' },
      { id: 'codestral-latest',      label: 'Codestral' },
    ],
    adapter: openAICompatible('https://api.mistral.ai/v1/chat/completions'),
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
    ],
    adapter: openAICompatible('https://api.deepseek.com/v1/chat/completions'),
  },
  xai: {
    label: 'xAI',
    models: [
      { id: 'grok-4',      label: 'Grok 4' },
      { id: 'grok-3',      label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 mini' },
    ],
    adapter: openAICompatible('https://api.x.ai/v1/chat/completions'),
  },
  cohere: {
    label: 'Cohere',
    models: [
      { id: 'command-a-03-2025', label: 'Command A' },
    ],
    adapter: cohere,
  },
  groq: {
    label: 'Meta (via Groq)',
    models: [
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct',     label: 'Llama 4 Scout' },
    ],
    adapter: openAICompatible('https://api.groq.com/openai/v1/chat/completions'),
  },
  openrouter: {
    label: 'OpenRouter',
    freeFormModel: true,
    modelSuggestions: [
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-opus-4.5',
      'openai/gpt-5',
      'openai/gpt-5-mini',
      'google/gemini-2.5-pro',
      'meta-llama/llama-4-maverick',
      'mistralai/mistral-large',
      'deepseek/deepseek-chat',
    ],
    adapter: openAICompatible('https://openrouter.ai/api/v1/chat/completions', {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Mermaid Studio',
    }),
  },
};

// Custom endpoint — adapter is built per-request because the URL/headers
// come from the user's settings, not the registry.
function customAdapter({ baseUrl, openaiCompatible, customHeaders }) {
  if (openaiCompatible) {
    return openAICompatible(baseUrl, customHeaders || {});
  }
  // Non-compat: send raw {model, system, messages} as the body and let the
  // remote endpoint handle it. Response is expected to be {content: "..."}.
  return {
    buildRequest: (payload, apiKey) => ({
      url: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        ...(customHeaders || {}),
      },
      body: JSON.stringify(payload),
    }),
    parseResponse: data => {
      if (typeof data === 'string') return data;
      if (data && typeof data.content === 'string') return data.content;
      throw new Error('Custom endpoint returned unexpected shape (expected {content: string})');
    },
  };
}

function getProvider(name) {
  return PROVIDERS[name] || null;
}

// Public catalog — what the client needs to render the picker.
function publicCatalog() {
  const out = {};
  for (const [name, p] of Object.entries(PROVIDERS)) {
    out[name] = {
      label: p.label,
      models: p.models || [],
      freeFormModel: !!p.freeFormModel,
      modelSuggestions: p.modelSuggestions || [],
    };
  }
  return out;
}

module.exports = { PROVIDERS, getProvider, customAdapter, publicCatalog };
