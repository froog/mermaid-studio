import { STORAGE_KEY, EXAMPLES } from './config.js';

export function newChatId() { return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

export function makeChat(code, opts) {
  const greet = !opts || opts.greet !== false;
  return {
    id: newChatId(),
    title: '',
    messages: [],
    code: code,
    updatedAt: Date.now(),
    showGreeting: greet,
  };
}

export function deriveTitle(chat) {
  const firstUser = chat.messages.find(m => m.role === 'user');
  if (firstUser) {
    const t = firstUser.content.trim().replace(/\s+/g, ' ');
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }
  const d = new Date(chat.updatedAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `New chat ${hh}:${mm}`;
}

export function seedChat() {
  const ex = EXAMPLES[0];
  const c = makeChat(ex.code, { greet: false });
  c.title = `Example - ${ex.label}`;
  c.messages.push({
    role: 'assistant',
    content: `Loaded example: ${ex.label}.\n\n\`\`\`mermaid\n${ex.code}\n\`\`\``,
    ts: Date.now(),
  });
  return c;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.chats && parsed.activeId && parsed.chats[parsed.activeId]) {
        return parsed;
      }
    }
  } catch {}
  const seed = seedChat();
  return { activeId: seed.id, chats: { [seed.id]: seed } };
}

export function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}

export let store = loadStore();
export let activeChat = store.chats[store.activeId];
export let chatMessages = activeChat.messages;
export let chatLoading = false;
export let pendingEdge = null;

export function setActiveChat(id) {
  store.activeId = id;
  activeChat = store.chats[id];
  chatMessages = activeChat.messages;
}

export function setChatLoading(v) { chatLoading = v; }
export function setPendingEdge(v) { pendingEdge = v; }
