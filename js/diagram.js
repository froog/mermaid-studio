import { escapeRegex } from './config.js';
import { editor, diagramContent } from './dom.js';
import { pendingEdge } from './store.js';

export const EDGE_RE = /(--+>|--+|==+>|==+|-\.+->|-\.+-|<-->|<==>|--\|>|<\|--|o--|--o|\*--|--\*)/;
export const NODE_OPEN = /^([A-Za-z_][\w-]*)(\[|\(|\{|>|\[\[|\(\[|\(\(|\{\{)/;

const BRACKET_PAIRS = {
  '[': ']', '(': ')', '{': '}', '>': ']',
  '[[': ']]', '([': '])', '((': '))', '{{': '}}',
};

export let renderState = null;

let renderTimer = null;
let renderId = 0;

// ─── Source Map ───

function detectDiagramType(code) {
  const first = code.split('\n').find(l => l.trim() && !l.trim().startsWith('%%'));
  if (!first) return 'other';
  const t = first.trim().toLowerCase();
  if (t.startsWith('graph ') || t.startsWith('flowchart ')) return 'flowchart';
  if (t.startsWith('statediagram')) return 'state';
  if (t.startsWith('classdiagram')) return 'class';
  if (t.startsWith('architecture')) return 'architecture';
  return 'other';
}

function stripComments(lines) {
  const out = [];
  let inInit = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!inInit && t.startsWith('%%{')) { inInit = true; out.push(null); continue; }
    if (inInit) { out.push(null); if (t.endsWith('}%%')) inInit = false; continue; }
    if (t.startsWith('%%')) { out.push(null); continue; }
    out.push(lines[i]);
  }
  return out;
}

function parseFlowchart(lines, masked) {
  const byId = new Map();
  const byLine = new Map();

  function addEntry(id, entry) {
    if (!byId.has(id)) byId.set(id, entry);
    const bucket = byLine.get(entry.line) || [];
    bucket.push(id);
    byLine.set(entry.line, bucket);
  }

  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === null) continue;
    const raw = masked[i];
    const t = raw.trim();
    if (!t || t.startsWith('graph ') || t.startsWith('flowchart ')) continue;

    if (t.startsWith('subgraph')) {
      const m = t.match(/^subgraph\s+([\w-]+)/);
      if (m) {
        const sgId = m[1];
        // Force-register as cluster, overwriting any prior node ref from an edge line
        if (byId.has(sgId)) {
          const old = byId.get(sgId);
          const oldBucket = byLine.get(old.line);
          if (oldBucket) {
            const idx = oldBucket.indexOf(sgId);
            if (idx >= 0) oldBucket.splice(idx, 1);
          }
        }
        byId.set(sgId, { kind: 'cluster', line: i, raw: t });
        const bucket = byLine.get(i) || [];
        bucket.push(sgId);
        byLine.set(i, bucket);
      }
      continue;
    }
    if (t === 'end') continue;
    if (t.startsWith('style ') || t.startsWith('classDef ') || t.startsWith('class ') || t.startsWith('linkStyle ') || t.startsWith('direction ')) continue;

    const stripped = t.replace(/"[^"]*"/g, m => '"' + '_'.repeat(m.length - 2) + '"');

    if (EDGE_RE.test(stripped)) {
      const parts = stripped.split(EDGE_RE);
      let prev = null;
      for (let p = 0; p < parts.length; p++) {
        const seg = parts[p].trim().replace(/\|[^|]*\|/, '').trim();
        if (EDGE_RE.test(parts[p])) {
          if (prev !== null) {
            let nextSeg = '';
            for (let q = p + 1; q < parts.length; q++) {
              if (!EDGE_RE.test(parts[q])) { nextSeg = parts[q].trim().replace(/\|[^|]*\|/, '').trim(); break; }
            }
            const fromId = prev.match(NODE_OPEN) ? prev.match(NODE_OPEN)[1] : prev.split(/[\[\(\{>]/)[0].trim();
            const toRaw = nextSeg.match(NODE_OPEN) ? nextSeg.match(NODE_OPEN)[1] : nextSeg.split(/[\[\(\{>]/)[0].trim();
            if (fromId && toRaw) {
              const edgeKey = fromId + '-' + toRaw;
              addEntry(edgeKey, { kind: 'edge', line: i, raw: t, from: fromId, to: toRaw });
              if (!byId.has(fromId)) addEntry(fromId, { kind: 'node', line: i, raw: t });
              if (!byId.has(toRaw)) addEntry(toRaw, { kind: 'node', line: i, raw: t });
            }
          }
        } else if (seg) {
          prev = seg;
          const nm = seg.match(NODE_OPEN);
          if (nm && !byId.has(nm[1])) addEntry(nm[1], { kind: 'node', line: i, raw: t });
        }
      }
    } else {
      const nm = t.match(NODE_OPEN);
      if (nm) addEntry(nm[1], { kind: 'node', line: i, raw: t });
    }
  }
  return { byId, byLine };
}

function parseState(lines, masked) {
  const byId = new Map();
  const byLine = new Map();
  function add(id, entry) {
    if (!byId.has(id)) byId.set(id, entry);
    const b = byLine.get(entry.line) || []; b.push(id); byLine.set(entry.line, b);
  }
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === null) continue;
    const t = masked[i].trim();
    if (!t || t.startsWith('stateDiagram')) continue;
    const trans = t.match(/^(\S+)\s*-->\s*(\S+)/);
    if (trans) {
      const [, from, to] = trans;
      if (!byId.has(from)) add(from, { kind: 'node', line: i, raw: t });
      if (!byId.has(to)) add(to, { kind: 'node', line: i, raw: t });
      add(from + '-' + to, { kind: 'edge', line: i, raw: t, from, to });
      continue;
    }
    const stateAs = t.match(/^state\s+"[^"]*"\s+as\s+(\w+)/);
    if (stateAs) { add(stateAs[1], { kind: 'node', line: i, raw: t }); continue; }
    const stateBlock = t.match(/^state\s+(\w+)\s*\{/);
    if (stateBlock) add(stateBlock[1], { kind: 'cluster', line: i, raw: t });
  }
  return { byId, byLine };
}

function parseClass(lines, masked) {
  const byId = new Map();
  const byLine = new Map();
  function add(id, entry) {
    if (!byId.has(id)) byId.set(id, entry);
    const b = byLine.get(entry.line) || []; b.push(id); byLine.set(entry.line, b);
  }
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === null) continue;
    const t = masked[i].trim();
    if (!t || t.startsWith('classDiagram')) continue;
    const classDef = t.match(/^class\s+(\w+)/);
    if (classDef) { add(classDef[1], { kind: 'node', line: i, raw: t }); continue; }
    const rel = t.match(/^(\w+)\s*(<\|--|--\|>|\*--|--\*|o--|--o|<--|-->|--)\s*(\w+)/);
    if (rel) {
      const [, from, , to] = rel;
      if (!byId.has(from)) add(from, { kind: 'node', line: i, raw: t });
      if (!byId.has(to)) add(to, { kind: 'node', line: i, raw: t });
      add(from + '-' + to, { kind: 'edge', line: i, raw: t, from, to });
    }
  }
  return { byId, byLine };
}

function parseArchitecture(lines, masked) {
  const byId = new Map();
  const byLine = new Map();
  function add(id, entry) {
    if (!byId.has(id)) byId.set(id, entry);
    const b = byLine.get(entry.line) || []; b.push(id); byLine.set(entry.line, b);
  }
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === null) continue;
    const t = masked[i].trim();
    if (!t || t.startsWith('architecture')) continue;
    const grp = t.match(/^group\s+(\w+)/);
    if (grp) { add(grp[1], { kind: 'cluster', line: i, raw: t }); continue; }
    const svc = t.match(/^service\s+(\w+)/);
    if (svc) { add(svc[1], { kind: 'node', line: i, raw: t }); continue; }
    const edge = t.match(/^(\w+):[A-Z]+\s*--\s*[A-Z]+:(\w+)/);
    if (edge) {
      const [, from, to] = edge;
      add(from + '-' + to, { kind: 'edge', line: i, raw: t, from, to });
    }
  }
  return { byId, byLine };
}

export function buildSourceMap(code) {
  const lines = code.split('\n');
  const masked = stripComments(lines);
  const diagramType = detectDiagramType(code);
  let byId = new Map(), byLine = new Map();
  if (diagramType === 'flowchart') ({ byId, byLine } = parseFlowchart(lines, masked));
  else if (diagramType === 'state') ({ byId, byLine } = parseState(lines, masked));
  else if (diagramType === 'class') ({ byId, byLine } = parseClass(lines, masked));
  else if (diagramType === 'architecture') ({ byId, byLine } = parseArchitecture(lines, masked));
  renderState = { diagramType, byElementId: byId, byLine, sourceLines: lines };
}

function domIdToSourceId(domId, diagramType) {
  if (!domId) return null;
  if (diagramType === 'flowchart') {
    const nodeM = domId.match(/^flowchart-(.+)-\d+$/);
    if (nodeM) return nodeM[1];
    return domId;
  }
  if (diagramType === 'state') {
    const m = domId.match(/^stateDiagram-(.+)-\d+$/) || domId.match(/^state-(.+)-\d+$/);
    return m ? m[1] : domId;
  }
  if (diagramType === 'class') {
    const m = domId.match(/^classId-(.+)-\d+$/) || domId.match(/^classDef-(.+)-\d+$/);
    return m ? m[1] : domId;
  }
  if (diagramType === 'architecture') {
    const m = domId.match(/^architecture-(.+)-\d+$/);
    return m ? m[1] : domId;
  }
  return domId;
}

export function tagSvgElements() {
  if (!renderState) return;
  const svg = getSvg();
  if (!svg) return;
  const { diagramType, byElementId } = renderState;
  let tagged = 0;

  svg.querySelectorAll('g.node[id], g.cluster[id]').forEach(el => {
    const bare = el.id.replace(/^mmd-\d+-/, '');
    const sourceId = domIdToSourceId(bare, diagramType);
    if (sourceId && byElementId.has(sourceId)) { el.dataset.msId = sourceId; tagged++; }
  });

  svg.querySelectorAll('g.label[data-id]').forEach(el => {
    const raw = el.dataset.id;
    const m = raw.match(/^L_(.+?)_\d+$/);
    if (m) {
      const key = m[1].replace(/_/g, '-');
      if (byElementId.has(key)) {
        const target = el.closest('g.edgeLabel') || el.parentElement;
        if (target) { target.dataset.msId = key; tagged++; }
      }
    }
  });

  console.debug('[ms] tagged', tagged, 'SVG elements; map size:', byElementId.size);
}

// ─── Diagram Rendering ───

export function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderDiagram, 400);
}

export async function renderDiagram() {
  const code = editor.value.trim();
  if (!code) {
    diagramContent.textContent = '';
    const ph = document.createElement('span');
    ph.className = 'placeholder';
    ph.textContent = 'Start typing to see your diagram…';
    diagramContent.appendChild(ph);
    return;
  }
  const id = ++renderId;
  try {
    const uniqueId = `mmd-${Date.now()}`;
    buildSourceMap(code);
    const { svg } = await mermaid.render(uniqueId, code);
    if (id === renderId) {
      const stage = document.createElement('div');
      stage.className = 'diagram-stage';
      stage.appendChild(document.createRange().createContextualFragment(svg));
      diagramContent.textContent = '';
      diagramContent.appendChild(stage);
      tagSvgElements();
      fitDiagram();
    }
  } catch (e) {
    if (id === renderId) {
      diagramContent.textContent = '';
      const box = document.createElement('div');
      box.className = 'error-box';
      const label = document.createElement('span');
      label.className = 'error-label';
      label.textContent = '⚠ SYNTAX ERROR';
      const pre = document.createElement('pre');
      pre.className = 'error-pre';
      pre.textContent = e.message || 'Syntax error';
      box.appendChild(label);
      box.appendChild(pre);
      diagramContent.appendChild(box);
    }
    document.querySelectorAll('[id^="dmmd-"]').forEach(el => el.remove());
  }
}

// ─── Zoom & Pan ───

let view = { x: 0, y: 0, scale: 1, baseW: 0, baseH: 0 };

export function getStage() { return diagramContent.querySelector('.diagram-stage'); }
export function getSvg() { const s = getStage(); return s ? s.querySelector('svg') : null; }

function applyView() {
  const stage = getStage();
  const svg = getSvg();
  if (!stage || !svg || !view.baseW) return;
  svg.style.width = `${view.baseW * view.scale}px`;
  svg.style.height = `${view.baseH * view.scale}px`;
  stage.style.transform = `translate(${view.x}px, ${view.y}px)`;
}

function captureBaseSize() {
  const svg = getSvg();
  if (!svg) return;
  svg.style.maxWidth = 'none';
  svg.style.width = '';
  svg.style.height = '';
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (vb && vb.width && vb.height) {
    view.baseW = vb.width;
    view.baseH = vb.height;
  } else {
    const r = svg.getBoundingClientRect();
    view.baseW = r.width;
    view.baseH = r.height;
  }
}

export function fitDiagram() {
  if (!getSvg()) return;
  captureBaseSize();
  const cw = diagramContent.clientWidth;
  const ch = diagramContent.clientHeight;
  if (!view.baseW || !view.baseH) return;
  const scale = Math.min(1, (cw - 48) / view.baseW, (ch - 48) / view.baseH);
  view.scale = scale;
  view.x = (cw - view.baseW * scale) / 2;
  view.y = (ch - view.baseH * scale) / 2;
  applyView();
}

diagramContent.addEventListener('wheel', e => {
  if (!getSvg()) return;
  e.preventDefault();
  const rect = diagramContent.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const factor = Math.exp(-e.deltaY * 0.0015);
  const newScale = Math.min(20, Math.max(0.05, view.scale * factor));
  const k = newScale / view.scale;
  view.x = cx - (cx - view.x) * k;
  view.y = cy - (cy - view.y) * k;
  view.scale = newScale;
  applyView();
}, { passive: false });

let panState = null;
diagramContent.addEventListener('mousedown', e => {
  if (e.button !== 0 || !getStage() || pendingEdge) return;
  panState = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
  diagramContent.classList.add('panning');
});
window.addEventListener('mousemove', e => {
  if (!panState) return;
  view.x = panState.origX + (e.clientX - panState.startX);
  view.y = panState.origY + (e.clientY - panState.startY);
  applyView();
});
window.addEventListener('mouseup', () => {
  if (!panState) return;
  panState = null;
  diagramContent.classList.remove('panning');
});
diagramContent.addEventListener('dblclick', () => { fitDiagram(); });
