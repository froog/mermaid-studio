function buildRequest({ model, system, messages, max_tokens }, apiKey) {
  const contents = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (max_tokens) body.generationConfig = { maxOutputTokens: max_tokens };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return {
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseResponse(data) {
  if (data && data.error) throw new Error(data.error.message || 'Google error');
  const cand = data && data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  if (!parts) throw new Error('Unexpected response shape');
  return parts.map(p => p.text || '').join('');
}

module.exports = { buildRequest, parseResponse };
