// OpenAI-compatible adapter — used by OpenAI, Mistral, DeepSeek, xAI, Groq,
// OpenRouter, and custom (OpenAI-compatible) endpoints. The provider config
// supplies the host/path and any extra headers.

function buildOpenAIRequest({ url, extraHeaders }) {
  return ({ model, system, messages, max_tokens }, apiKey) => {
    const apiMessages = [];
    if (system) apiMessages.push({ role: 'system', content: system });
    for (const m of messages) apiMessages.push({ role: m.role, content: m.content });

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        ...(max_tokens ? { max_tokens } : {}),
      }),
    };
  };
}

function parseOpenAIResponse(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new Error('Unexpected response shape');
  return msg.content || '';
}

module.exports = { buildOpenAIRequest, parseOpenAIResponse };
