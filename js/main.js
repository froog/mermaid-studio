import { EXAMPLES } from './config.js';
import { editor, chatSelect, chatNewBtn, chatDelBtn, exampleSelect, loadBtn, loadInput } from './dom.js';
import { store, activeChat, saveStore, setActiveChat, seedChat, makeChat, deriveTitle } from './store.js';
import { scheduleRender } from './diagram.js';
import { setCode, updateLineNumbers, refreshSelect } from './editor.js';
import { renderChat } from './chat.js';
import './ui.js';
import { checkSession } from './auth.js';
import './settings.js';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true, background: '#0d1117', primaryColor: '#1f6feb',
    primaryTextColor: '#c9d1d9', primaryBorderColor: '#30363d',
    lineColor: '#484f58', secondaryColor: '#161b22', tertiaryColor: '#21262d',
  },
  flowchart: { curve: 'basis' },
  securityLevel: 'loose',
});

function switchChat(id) {
  if (!store.chats[id]) return;
  setActiveChat(id);
  saveStore();
  editor.value = activeChat.code;
  updateLineNumbers();
  scheduleRender();
  renderChat();
  refreshSelect();
}

function openChatWith(code, titleHint, opts) {
  const c = makeChat(code, opts);
  if (titleHint) c.title = titleHint;
  if (opts && opts.seedMessage && code && code.trim()) {
    c.messages.push({
      role: 'assistant',
      content: `${opts.seedMessage}\n\n\`\`\`mermaid\n${code}\n\`\`\``,
      ts: Date.now(),
    });
  }
  store.chats[c.id] = c;
  setActiveChat(c.id);
  saveStore();
  editor.value = c.code;
  updateLineNumbers();
  scheduleRender();
  renderChat();
  refreshSelect();
}

function deleteActiveChat() {
  delete store.chats[store.activeId];
  const remaining = Object.keys(store.chats);
  if (remaining.length === 0) {
    const c = seedChat();
    store.chats[c.id] = c;
    setActiveChat(c.id);
  } else {
    remaining.sort((a, b) => store.chats[b].updatedAt - store.chats[a].updatedAt);
    setActiveChat(remaining[0]);
  }
  saveStore();
  editor.value = activeChat.code;
  updateLineNumbers();
  scheduleRender();
  renderChat();
  refreshSelect();
}

// ─── Burger menu ───
const burgerBtn = document.getElementById('burger-btn');
const burgerMenu = document.getElementById('burger-menu');
burgerBtn.addEventListener('click', e => {
  e.stopPropagation();
  burgerMenu.hidden = !burgerMenu.hidden;
});
document.addEventListener('click', e => {
  if (!burgerMenu.hidden && !burgerMenu.contains(e.target)) {
    burgerMenu.hidden = true;
  }
});

// ─── Example dropdown ───
EXAMPLES.forEach((ex, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = ex.label;
  exampleSelect.appendChild(opt);
});
exampleSelect.addEventListener('change', e => {
  const i = e.target.value;
  if (i === '') return;
  const ex = EXAMPLES[Number(i)];
  openChatWith(ex.code, `Example - ${ex.label}`, { greet: false, seedMessage: `Loaded example: ${ex.label}.` });
  exampleSelect.value = '';
  burgerMenu.hidden = true;
});

// ─── Chat controls ───
chatSelect.addEventListener('change', e => switchChat(e.target.value));
chatNewBtn.addEventListener('click', () => openChatWith(''));
chatDelBtn.addEventListener('click', () => {
  if (!window.confirm('Delete this chat?')) return;
  deleteActiveChat();
});

// ─── File upload ───
loadBtn.addEventListener('click', () => {
  loadInput.value = '';
  loadInput.click();
});
loadInput.addEventListener('change', () => {
  const file = loadInput.files && loadInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    openChatWith(text, file.name || 'Loaded chat', { greet: false, seedMessage: `Loaded file: ${file.name}.` });
  };
  reader.readAsText(file);
});

// ─── Boot ───
if (!activeChat.title) activeChat.title = deriveTitle(activeChat);
setCode(activeChat.code);
refreshSelect();
renderChat();
checkSession();
