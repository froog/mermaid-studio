import { editor, lineNumbers, chatSelect, downloadBtn } from './dom.js';
import { activeChat, chatMessages, store, saveStore, deriveTitle } from './store.js';
import { scheduleRender } from './diagram.js';

export let charWidth = 7.8;

let _snapTimer = null;
let _lastSnapshotCode = '';

(() => {
  const s = document.createElement('span');
  s.style.cssText = "position:absolute;visibility:hidden;font-family:'JetBrains Mono',monospace;font-size:13px;white-space:pre;";
  s.textContent = 'x'.repeat(80);
  document.body.appendChild(s);
  charWidth = s.getBoundingClientRect().width / 80;
  s.remove();
})();

export function updateLineNumbers() {
  const lines = editor.value.split('\n');
  lineNumbers.textContent = '';
  for (let i = 0; i < lines.length; i++) {
    const d = document.createElement('div');
    d.className = 'line-num';
    d.dataset.line = i;
    d.textContent = i + 1;
    lineNumbers.appendChild(d);
  }
}

export function refreshSelect() {
  const ids = Object.keys(store.chats).sort(
    (a, b) => store.chats[b].updatedAt - store.chats[a].updatedAt
  );
  chatSelect.textContent = '';
  ids.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = store.chats[id].title || deriveTitle(store.chats[id]);
    chatSelect.appendChild(opt);
  });
  chatSelect.value = store.activeId;
}

export function persist() {
  activeChat.code = editor.value;
  activeChat.updatedAt = Date.now();
  activeChat.title = deriveTitle(activeChat);
  saveStore();
  refreshSelect();
}

function recordSnapshot() {
  const code = editor.value.trim();
  if (!code || code === _lastSnapshotCode) return;
  const prev = _lastSnapshotCode;
  _lastSnapshotCode = code;
  chatMessages.push({ role: 'assistant', content: '', ts: Date.now(), source: 'edit', prev, code });
  saveStore();
  document.dispatchEvent(new CustomEvent('editor-snapshot'));
}

export function setCode(code) {
  editor.value = code;
  updateLineNumbers();
  scheduleRender();
  persist();
  clearTimeout(_snapTimer);
  _lastSnapshotCode = code.trim();
}

editor.addEventListener('input', () => {
  updateLineNumbers(); scheduleRender(); persist();
  clearTimeout(_snapTimer);
  _snapTimer = setTimeout(recordSnapshot, 2000);
});
editor.addEventListener('scroll', () => { lineNumbers.scrollTop = editor.scrollTop; });
editor.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 4;
    updateLineNumbers();
    scheduleRender();
    persist();
    clearTimeout(_snapTimer);
    _snapTimer = setTimeout(recordSnapshot, 2000);
  }
});

downloadBtn.addEventListener('click', () => {
  const text = editor.value;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (activeChat.title || 'mermaid').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'mermaid';
  a.href = url;
  a.download = `${safe}.mmd`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
