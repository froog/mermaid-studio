import { GREETING, fmtTs } from './config.js';
import { chatScroll, chatInput, sendBtn, editor } from './dom.js';
import { activeChat, chatMessages, chatLoading, setChatLoading } from './store.js';
import { setCode, persist } from './editor.js';
import { getSelection } from './settings.js';
import { getCurrentUser } from './auth.js';

function lineDiff(oldCode, newCode) {
  const a = (oldCode || '').split('\n').map(l => l.trimEnd()).filter(Boolean);
  const b = (newCode || '').split('\n').map(l => l.trimEnd()).filter(Boolean);
  const aSet = new Set(a);
  const bSet = new Set(b);
  return { removed: a.filter(l => !bSet.has(l)), added: b.filter(l => !aSet.has(l)) };
}

export function renderChat() {
  chatScroll.textContent = '';
  const display = (chatMessages.length === 0 && activeChat.showGreeting)
    ? [{ role: 'assistant', content: GREETING }]
    : chatMessages;

  display.forEach(msg => {
    const isUser = msg.role === 'user';
    const row = document.createElement('div');
    row.className = 'msg-row' + (isUser ? ' user' : '');

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble ' + (isUser ? 'user-bubble' : 'ai-bubble');

    if (msg.ts) {
      const ts = document.createElement('span');
      ts.className = 'msg-ts';
      ts.textContent = fmtTs(msg.ts);
      bubble.appendChild(ts);
    }

    if (msg.code !== undefined) {
      if (msg.content) {
        const span = document.createElement('span');
        span.style.whiteSpace = 'pre-wrap';
        span.textContent = msg.content;
        bubble.appendChild(span);
      }
      if (msg.code) {
        const block = document.createElement('div');
        block.className = 'code-block';
        if (msg.prev !== undefined) {
          const { added, removed } = lineDiff(msg.prev, msg.code);
          if (added.length || removed.length) {
            const pre = document.createElement('pre');
            for (const l of removed) {
              const span = document.createElement('span');
              span.className = 'diff-removed';
              span.textContent = `− ${l}\n`;
              pre.appendChild(span);
            }
            for (const l of added) {
              const span = document.createElement('span');
              span.className = 'diff-added';
              span.textContent = `+ ${l}\n`;
              pre.appendChild(span);
            }
            block.appendChild(pre);
          }
        } else {
          const pre = document.createElement('pre');
          pre.textContent = msg.code;
          block.appendChild(pre);
        }
        const btn = document.createElement('button');
        btn.className = 'insert-btn';
        btn.textContent = '↗ Insert into Editor';
        btn.addEventListener('click', () => setCode(msg.code));
        block.appendChild(btn);
        bubble.appendChild(block);
      }
    } else {
      if (msg.content) {
        const span = document.createElement('span');
        span.style.whiteSpace = 'pre-wrap';
        span.textContent = msg.content;
        bubble.appendChild(span);
      }
    }

    row.appendChild(bubble);
    chatScroll.appendChild(row);
  });

  if (chatLoading) {
    const row = document.createElement('div');
    row.className = 'msg-row';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble ai-bubble';
    const dots = document.createElement('span');
    dots.className = 'loading-dots';
    dots.textContent = '●●●';
    bubble.appendChild(dots);
    row.appendChild(bubble);
    chatScroll.appendChild(row);
  }

  chatScroll.scrollTop = chatScroll.scrollHeight;
}

export async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || chatLoading) return;

  if (!getCurrentUser()) {
    chatMessages.push({ role: 'assistant', content: 'Sign in to use AI features.', ts: Date.now() });
    persist();
    renderChat();
    return;
  }

  const sel = getSelection();
  if (!sel.model) {
    chatMessages.push({ role: 'assistant', content: 'No model selected. Open Settings to choose a provider and model.', ts: Date.now() });
    persist();
    renderChat();
    return;
  }

  chatInput.value = '';
  chatMessages.push({ role: 'user', content: text, ts: Date.now() });
  setChatLoading(true);
  persist();
  renderChat();

  try {
    const context = editor.value.trim();

    const apiMessages = chatMessages
      .filter(m => m.role !== 'system' && m.source !== 'edit')
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        provider: sel.provider,
        model: sel.model,
        context,
        messages: apiMessages,
        ...(sel.custom ? { custom: sel.custom } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    let reply;
    if (!res.ok) {
      reply = data.error || `Error ${res.status}`;
    } else {
      reply = data.content || 'Sorry, something went wrong.';
    }
    const mMatch = reply.match(/```mermaid\n?([\s\S]*?)```/);
    const code = mMatch ? mMatch[1].trim() : '';
    const content = mMatch ? reply.replace(/```mermaid[\s\S]*?```/, '').trim() : reply;
    const prevCode = editor.value.trim();
    chatMessages.push({ role: 'assistant', content, ts: Date.now(), prev: prevCode, ...(code ? { code } : {}) });
    if (res.ok && code) setCode(code);
  } catch {
   chatMessages.push({ role: 'assistant', content: "Network error — couldn't reach the AI.", ts: Date.now() });
 }

  setChatLoading(false);
  persist();
  renderChat();
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); });
document.addEventListener('editor-snapshot', renderChat);
