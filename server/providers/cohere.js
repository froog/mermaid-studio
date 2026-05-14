// Cohere v2 chat — uses messages array (system/user/assistant) directly.

function buildRequest({ model, system, messages, max_tokens }, apiKey) {
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: system });
  for (const m of messages) apiMessages.push({ role: m.role, content: m.content });

  const body = { model, messages: apiMessages };
  if (max_tokens) body.max_tokens = max_tokens;

  return {
    url: 'https://api.cohere.com/v2/chat',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  };
}

function parseResponse(data) {
  if (data && data.message) {
    const msg = data.message;
    if (Array.isArray(msg.content)) {
      return msg.content.map(b => b.text || '').join('');
    }
    if (typeof msg.content === 'string') return msg.content;
  }
  if (typeof data?.text === 'string') return data.text;
  throw new Error('Unexpected response shape');
}

module.exports = { buildRequest, parseResponse };
