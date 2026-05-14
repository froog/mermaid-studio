function buildRequest({ model, system, messages, max_tokens }, apiKey) {
  const filtered = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  const body = {
    model,
    max_tokens: max_tokens || 4096,
    messages: filtered,
  };
  if (system) body.system = system;

  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  };
}

function parseResponse(data) {
  if (!data || !Array.isArray(data.content)) {
    if (data && data.error) throw new Error(data.error.message || 'Anthropic error');
    throw new Error('Unexpected response shape');
  }
  return data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

module.exports = { buildRequest, parseResponse };
