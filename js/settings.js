import { onAuthChange, getCurrentUser } from './auth.js';

const PREFS_KEY = 'mermaid-studio:prefs:v1';

const DEFAULTS = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  customModel: '', // for free-form (openrouter) and custom endpoint
  custom: {
    baseUrl: '',
    model: '',
    openaiCompatible: true,
    headers: '',
  },
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.custom) delete p.custom.apiKey;
      return { ...DEFAULTS, ...p, custom: { ...DEFAULTS.custom, ...(p.custom || {}) } };
    }
  } catch {}
  return { ...DEFAULTS, custom: { ...DEFAULTS.custom } };
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  debounceSaveToServer();
}

let _saveToServerTimer = null;
function debounceSaveToServer() {
  clearTimeout(_saveToServerTimer);
  _saveToServerTimer = setTimeout(savePrefsToServer, 500);
}
async function savePrefsToServer() {
  if (!getCurrentUser()) return;
  try {
    await fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(prefs),
    });
  } catch {}
}

async function loadAndApplyServerPrefs() {
  try {
    const res = await fetch('/api/prefs', { credentials: 'same-origin' });
    if (!res.ok) return;
    const sp = await res.json();
    if (!sp || Object.keys(sp).length === 0) {
      // No server prefs yet — push local prefs up
      await savePrefsToServer();
      return;
    }
    // Server prefs win: merge into local prefs
    Object.assign(prefs, sp);
    if (sp.custom) prefs.custom = { ...DEFAULTS.custom, ...sp.custom };
    delete prefs.custom?.apiKey; // never trust apiKey from server prefs
    savePrefs();           // update localStorage cache
    loadCustomIntoForm();
    applyProvider(prefs.provider);
  } catch {}
}

let prefs = loadPrefs();
let catalog = null;
let storedKeyProviders = new Set();

export function getSelection() {
  if (prefs.provider === 'custom') {
    return {
      provider: 'custom',
      model: prefs.custom.model,
      systemPrompt: prefs.systemPrompt,
      custom: { ...prefs.custom },
    };
  }
  // Free-form-model providers (openrouter) store the chosen ID in customModel.
  const model = (catalog && catalog[prefs.provider] && catalog[prefs.provider].freeFormModel)
    ? prefs.customModel
    : prefs.model;
  return {
    provider: prefs.provider,
    model,
    systemPrompt: prefs.systemPrompt,
    custom: null,
  };
}

// ─── DOM ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const panel = $('settings-panel');
const openBtn = $('settings-btn');
const closeBtn = $('settings-close');
const providerSel = $('settings-provider');
const modelSel = $('settings-model');
const modelRow = $('settings-model-row');
const modelTextRow = $('settings-model-text-row');
const modelText = $('settings-model-text');
const modelSuggest = $('settings-model-suggest');
const keyRow = $('settings-key-row');
const keyProviderLabel = $('settings-key-provider-label');
const keyInput = $('settings-key-input');
const keySaveBtn = $('settings-key-save');
const keyDeleteBtn = $('settings-key-delete');
const keyStatus = $('settings-key-status');
const keyLocked = $('settings-key-locked');
const customSection = $('settings-custom-section');
const customUrl = $('settings-custom-url');
const customModel = $('settings-custom-model');
const customKey = $('settings-custom-key');
const customKeyRow = $('settings-custom-key-row');
const customKeySaveBtn = $('settings-custom-key-save');
const customKeyDeleteBtn = $('settings-custom-key-delete');
const customKeyStatus = $('settings-custom-key-status');
const customKeyLocked = $('settings-custom-key-locked');
const customCompat = $('settings-custom-compat');
const customHeadersRow = $('settings-custom-headers-row');
const customHeaders = $('settings-custom-headers');
const systemPromptArea = $('settings-system-prompt');
const promptResetBtn = $('settings-prompt-reset');

// ─── Open/close ─────────────────────────────────────────────────────────
function open() {
  panel.hidden = false;
  refreshKeyRow();
  if (prefs.provider === 'custom') refreshCustomKeyRow();
}
function close() { panel.hidden = true; }
openBtn?.addEventListener('click', open);
closeBtn?.addEventListener('click', close);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !panel.hidden) close();
});

// ─── Provider/Model UI ──────────────────────────────────────────────────
async function loadCatalog() {
  const res = await fetch('/api/providers');
  catalog = await res.json();
  renderProviderOptions();
  applyProvider(prefs.provider);
}

function renderProviderOptions() {
  providerSel.textContent = '';
  for (const [name, p] of Object.entries(catalog)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = p.label;
    providerSel.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom endpoint';
  providerSel.appendChild(customOpt);
}

function show(el) { el.classList.remove('is-hidden'); }
function hide(el) { el.classList.add('is-hidden'); }

function applyProvider(name) {
  if (name === 'custom') {
    prefs.provider = 'custom';
    providerSel.value = 'custom';
    hide(modelRow);
    hide(modelTextRow);
    hide(keyRow);
    hide(keyLocked);
    show(customSection);
    refreshCustomKeyRow();
    savePrefs();
    return;
  }
  hide(customSection);
  const p = catalog && catalog[name];
  if (!p) {
    // catalog not loaded yet or unknown provider — fall back
    name = 'anthropic';
    return applyProvider(name);
  }
  prefs.provider = name;
  providerSel.value = name;

  if (p.freeFormModel) {
    hide(modelRow);
    show(modelTextRow);
    modelSuggest.textContent = '';
    for (const s of p.modelSuggestions) {
      const o = document.createElement('option');
      o.value = s;
      modelSuggest.appendChild(o);
    }
    if (!prefs.customModel) prefs.customModel = p.modelSuggestions[0] || '';
    modelText.value = prefs.customModel;
  } else {
    hide(modelTextRow);
    show(modelRow);
    modelSel.textContent = '';
    for (const m of p.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      modelSel.appendChild(opt);
    }
    const ids = p.models.map(m => m.id);
    if (!ids.includes(prefs.model)) prefs.model = ids[0] || '';
    modelSel.value = prefs.model;
  }

  refreshKeyRow();
  savePrefs();
}

providerSel.addEventListener('change', e => applyProvider(e.target.value));
modelSel.addEventListener('change', e => { prefs.model = e.target.value; savePrefs(); });
modelText.addEventListener('change', e => { prefs.customModel = e.target.value.trim(); savePrefs(); });

// ─── API Key field for selected provider ────────────────────────────────
async function refreshStoredKeys() {
  if (!getCurrentUser()) {
    storedKeyProviders = new Set();
    return;
  }
  try {
    const res = await fetch('/api/keys', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      storedKeyProviders = new Set(data.providers || []);
    }
  } catch {}
}

function refreshKeyRow() {
  if (prefs.provider === 'custom') return;
  const p = catalog && catalog[prefs.provider];
  if (!p) return;

  if (!getCurrentUser()) {
    hide(keyRow);
    show(keyLocked);
    return;
  }
  hide(keyLocked);
  show(keyRow);
  keyProviderLabel.textContent = p.label;
  keyInput.value = '';
  keyStatus.textContent = '';
  keyStatus.className = 'settings-key-status';
  const stored = storedKeyProviders.has(prefs.provider);
  if (stored) show(keyDeleteBtn); else hide(keyDeleteBtn);
  keyInput.placeholder = stored ? 'Stored — paste a new key to replace' : 'Paste API key';
}

async function saveProviderKey() {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    keyStatus.textContent = 'Enter a key first.';
    keyStatus.className = 'settings-key-status err';
    return;
  }
  keySaveBtn.disabled = true;
  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ provider: prefs.provider, apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    storedKeyProviders.add(prefs.provider);
    keyInput.value = '';
    keyStatus.textContent = 'Saved.';
    keyStatus.className = 'settings-key-status ok';
    show(keyDeleteBtn);
    keyInput.placeholder = 'Stored — paste a new key to replace';
  } catch (err) {
    keyStatus.textContent = err.message;
    keyStatus.className = 'settings-key-status err';
  } finally {
    keySaveBtn.disabled = false;
  }
}

async function deleteProviderKey() {
  if (!confirm(`Remove stored ${prefs.provider} key?`)) return;
  try {
    await fetch(`/api/keys/${encodeURIComponent(prefs.provider)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    storedKeyProviders.delete(prefs.provider);
    hide(keyDeleteBtn);
    keyStatus.textContent = 'Removed.';
    keyStatus.className = 'settings-key-status ok';
    keyInput.placeholder = 'Paste API key';
  } catch (err) {
    keyStatus.textContent = String(err);
    keyStatus.className = 'settings-key-status err';
  }
}

keySaveBtn.addEventListener('click', saveProviderKey);
keyDeleteBtn.addEventListener('click', deleteProviderKey);

// ─── Custom endpoint ────────────────────────────────────────────────────
function loadCustomIntoForm() {
  customUrl.value = prefs.custom.baseUrl;
  customModel.value = prefs.custom.model;
  customCompat.checked = prefs.custom.openaiCompatible;
  customHeaders.value = prefs.custom.headers;
  if (customCompat.checked) hide(customHeadersRow); else show(customHeadersRow);
}
function persistCustomFromForm() {
  prefs.custom.baseUrl = customUrl.value.trim();
  prefs.custom.model = customModel.value.trim();
  prefs.custom.openaiCompatible = customCompat.checked;
  prefs.custom.headers = customHeaders.value;
  savePrefs();
}
[customUrl, customModel, customHeaders].forEach(el =>
  el.addEventListener('change', persistCustomFromForm)
);
customCompat.addEventListener('change', () => {
  if (customCompat.checked) hide(customHeadersRow); else show(customHeadersRow);
  persistCustomFromForm();
});

function refreshCustomKeyRow() {
  if (!getCurrentUser()) {
    hide(customKeyRow);
    show(customKeyLocked);
    return;
  }
  show(customKeyRow);
  hide(customKeyLocked);
  customKey.value = '';
  customKeyStatus.textContent = '';
  customKeyStatus.className = 'settings-key-status';
  const stored = storedKeyProviders.has('custom');
  if (stored) show(customKeyDeleteBtn); else hide(customKeyDeleteBtn);
  customKey.placeholder = stored ? 'Stored — paste a new key to replace' : 'leave blank for local models';
}

async function saveCustomKey() {
  const apiKey = customKey.value.trim();
  if (!apiKey) {
    customKeyStatus.textContent = 'Enter a key first.';
    customKeyStatus.className = 'settings-key-status err';
    return;
  }
  customKeySaveBtn.disabled = true;
  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ provider: 'custom', apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    storedKeyProviders.add('custom');
    customKey.value = '';
    customKeyStatus.textContent = 'Saved.';
    customKeyStatus.className = 'settings-key-status ok';
    show(customKeyDeleteBtn);
    customKey.placeholder = 'Stored — paste a new key to replace';
  } catch (err) {
    customKeyStatus.textContent = err.message;
    customKeyStatus.className = 'settings-key-status err';
  } finally {
    customKeySaveBtn.disabled = false;
  }
}

async function deleteCustomKey() {
  if (!confirm('Remove stored custom endpoint key?')) return;
  try {
    const res = await fetch('/api/keys/custom', { method: 'DELETE', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    storedKeyProviders.delete('custom');
    hide(customKeyDeleteBtn);
    customKeyStatus.textContent = 'Removed.';
    customKeyStatus.className = 'settings-key-status ok';
    customKey.placeholder = 'leave blank for local models';
  } catch (err) {
    customKeyStatus.textContent = String(err);
    customKeyStatus.className = 'settings-key-status err';
  }
}

customKeySaveBtn.addEventListener('click', saveCustomKey);
customKeyDeleteBtn.addEventListener('click', deleteCustomKey);

// ─── React to auth state ────────────────────────────────────────────────
onAuthChange(async () => {
  await refreshStoredKeys();
  if (getCurrentUser()) await loadAndApplyServerPrefs();
  if (!panel.hidden) {
    refreshKeyRow();
    if (prefs.provider === 'custom') refreshCustomKeyRow();
  }
});

// ─── Boot ───────────────────────────────────────────────────────────────
loadCustomIntoForm();
loadCatalog().then(refreshStoredKeys).then(() => {
  if (!panel.hidden) {
    refreshKeyRow();
    if (prefs.provider === 'custom') refreshCustomKeyRow();
  }
});
