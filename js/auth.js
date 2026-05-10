import {
  authStatus, authSigninBtn, authModal, authForm, authUsername, authPassword,
  authError, authSubmit, authToggle, authTitle, chatInput, sendBtn,
} from './dom.js';

let mode = 'login'; // 'login' | 'signup'
let currentUser = null;
const subscribers = new Set();

export function getCurrentUser() { return currentUser; }
export function onAuthChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function emit() { subscribers.forEach(fn => { try { fn(currentUser); } catch (e) { console.error(e); } }); }

export async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      setUser(data.username);
    } else {
      setUser(null);
    }
  } catch {
    setUser(null);
  }
}

function setUser(username) {
  currentUser = username;
  renderAuthStatus();
  applyChatLockState();
  emit();
}

function renderAuthStatus() {
  authStatus.textContent = '';
  if (currentUser) {
    const span = document.createElement('span');
    span.className = 'auth-user';
    span.textContent = currentUser;
    authStatus.appendChild(span);

    const out = document.createElement('button');
    out.className = 'burger-item';
    out.type = 'button';
    out.textContent = 'Sign out';
    out.addEventListener('click', logout);
    authStatus.appendChild(out);
  } else {
    const inBtn = document.createElement('button');
    inBtn.className = 'burger-item';
    inBtn.type = 'button';
    inBtn.textContent = 'Sign in';
    inBtn.addEventListener('click', openDialog);
    authStatus.appendChild(inBtn);
  }
}

function applyChatLockState() {
  const locked = !currentUser;
  chatInput.disabled = locked;
  sendBtn.disabled = locked;
  chatInput.placeholder = locked
    ? 'Sign in to use AI features'
    : 'Describe a diagram…';
}

// ─── Dialog ──────────────────────────────────────────────────────────────
function openDialog() {
  mode = 'login';
  authModal.hidden = false;
  syncDialogMode();
  authError.hidden = true;
  authForm.reset();
  setTimeout(() => authUsername.focus(), 30);
}
function closeDialog() {
  authModal.hidden = true;
  authError.hidden = true;
}
function syncDialogMode() {
  if (mode === 'login') {
    authTitle.textContent = 'Sign in';
    authSubmit.textContent = 'Sign In';
    authToggle.textContent = "Don't have an account? Create one";
    authPassword.autocomplete = 'current-password';
  } else {
    authTitle.textContent = 'Create account';
    authSubmit.textContent = 'Create Account';
    authToggle.textContent = 'Already have an account? Sign in';
    authPassword.autocomplete = 'new-password';
  }
}
function showError(text) {
  authError.textContent = text;
  authError.hidden = false;
}

async function submit(e) {
  e.preventDefault();
  authError.hidden = true;
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) return;
  authSubmit.disabled = true;
  try {
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || `Error (${res.status})`);
      return;
    }
    setUser(data.username);
    closeDialog();
  } catch (err) {
    showError('Network error — could not reach the server.');
  } finally {
    authSubmit.disabled = false;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  setUser(null);
}

// ─── Wire up ─────────────────────────────────────────────────────────────
authSigninBtn?.addEventListener('click', openDialog);
authForm.addEventListener('submit', submit);
authToggle.addEventListener('click', () => {
  mode = mode === 'login' ? 'signup' : 'login';
  syncDialogMode();
  authError.hidden = true;
});
authModal.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) closeDialog();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !authModal.hidden) closeDialog();
});

// initial paint (logged out until checkSession resolves)
renderAuthStatus();
applyChatLockState();
