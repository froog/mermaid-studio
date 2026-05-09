import { escapeRegex } from './config.js';
import { editor, lineNumbers, diagramContent, ctxMenu, chatInput, helpBtn, helpModal, helpContent, hlBand, hlToken } from './dom.js';
import { renderState, EDGE_RE, NODE_OPEN, getSvg } from './diagram.js';
import { pendingEdge, setPendingEdge } from './store.js';
import { charWidth, setCode } from './editor.js';

// ─── Hover Highlight ───

function hlEditorLine(lineIdx, fromSvg, sourceId) {
  if (lineIdx == null || !renderState) { clearEditorHl(); return; }
  const lh = 21;
  const top = lineIdx * lh + 14 - editor.scrollTop;
  hlBand.style.top = top + 'px';
  hlBand.style.display = 'block';
  hlBand.classList.toggle('svg-hl', !!fromSvg);
  lineNumbers.querySelectorAll('.line-num.hl').forEach(el => el.classList.remove('hl', 'svg-hl'));
  const row = lineNumbers.querySelector(`.line-num[data-line="${lineIdx}"]`);
  if (row) { row.classList.add('hl'); if (fromSvg) row.classList.add('svg-hl'); }

  if (fromSvg && sourceId && renderState.byElementId.has(sourceId)) {
    const entry = renderState.byElementId.get(sourceId);
    const lineText = renderState.sourceLines[lineIdx] || '';
    const range = findTokenRange(lineText, entry, sourceId);
    if (range) {
      const leftPad = 44 + 16;
      hlToken.style.left = (leftPad + range.col * charWidth) + 'px';
      hlToken.style.width = (range.len * charWidth) + 'px';
      hlToken.style.top = top + 'px';
      hlToken.style.display = 'block';
    } else {
      hlToken.style.display = 'none';
    }
  } else {
    hlToken.style.display = 'none';
  }
}

function clearEditorHl() {
  hlBand.style.display = 'none';
  hlBand.classList.remove('svg-hl');
  hlToken.style.display = 'none';
  lineNumbers.querySelectorAll('.line-num.hl').forEach(el => el.classList.remove('hl', 'svg-hl'));
}

function hlSvgId(sourceId) {
  clearSvgHl();
  if (!sourceId) return;
  const svg = getSvg();
  if (!svg) return;
  svg.querySelectorAll(`[data-ms-id="${sourceId}"]`).forEach(el => el.classList.add('ms-hl'));
}

function clearSvgHl() {
  const svg = getSvg();
  if (svg) svg.querySelectorAll('.ms-hl').forEach(el => el.classList.remove('ms-hl'));
}

function findTokenRange(lineText, entry, sourceId) {
  let m;
  if (entry.kind === 'node') {
    m = lineText.match(new RegExp('\\b' + escapeRegex(sourceId) + '\\b'));
    if (m) return { col: m.index, len: m[0].length };
  }
  if (entry.kind === 'edge' && entry.from && entry.to) {
    const labelM = lineText.match(/\|([^|]+)\|/);
    if (labelM) return { col: labelM.index, len: labelM[0].length };
    const arrowM = lineText.match(EDGE_RE);
    if (arrowM) return { col: arrowM.index, len: arrowM[0].length };
  }
  if (entry.kind === 'cluster') {
    m = lineText.match(new RegExp('\\b' + escapeRegex(sourceId) + '(?:\\s*\\[[^\\]]*\\])?'));
    if (m) return { col: m.index, len: m[0].length };
  }
  const id = sourceId.split('-')[0];
  const idx = lineText.indexOf(id);
  return idx >= 0 ? { col: idx, len: id.length } : null;
}

diagramContent.addEventListener('mouseover', e => {
  if (!renderState) return;
  const el = e.target.closest('[data-ms-id]');
  if (!el) { clearEditorHl(); return; }
  const entry = renderState.byElementId.get(el.dataset.msId);
  if (!entry) { clearEditorHl(); return; }
  hlEditorLine(entry.line, true, el.dataset.msId);
  hlSvgId(el.dataset.msId);
});

diagramContent.addEventListener('mouseleave', () => { clearEditorHl(); clearSvgHl(); });

editor.addEventListener('scroll', () => {
  const activeHl = lineNumbers.querySelector('.line-num.hl');
  if (activeHl) {
    const lineIdx = parseInt(activeHl.dataset.line, 10);
    hlEditorLine(lineIdx);
  }
});

lineNumbers.addEventListener('mouseover', e => {
  if (!renderState) return;
  const row = e.target.closest('.line-num');
  if (!row) return;
  const lineIdx = parseInt(row.dataset.line, 10);
  const ids = renderState.byLine.get(lineIdx) || [];
  clearSvgHl();
  lineNumbers.querySelectorAll('.line-num.hl').forEach(el => el.classList.remove('hl'));
  row.classList.add('hl');
  hlBand.style.top = (lineIdx * 21 + 14 - editor.scrollTop) + 'px';
  hlBand.style.display = 'block';
  const svg = getSvg();
  if (svg) ids.forEach(id => svg.querySelectorAll(`[data-ms-id="${id}"]`).forEach(el => el.classList.add('ms-hl')));
});

lineNumbers.addEventListener('mouseleave', () => { clearEditorHl(); clearSvgHl(); });

// ─── Source Rewrite ───

function needsQuoting(label) {
  return /[^\w\s-]/.test(label) || /^\d/.test(label);
}

function quoteLabel(label) {
  return needsQuoting(label) ? '"' + label.replace(/"/g, '&quot;') + '"' : label;
}

export function rewriteNodeLabel(lineIdx, nodeId, newLabel) {
  const lines = editor.value.split('\n');
  const trimmed = newLabel.trim();
  lines[lineIdx] = lines[lineIdx].replace(
    new RegExp('(\\b' + escapeRegex(nodeId) + ')(\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|>)((?:"[^"]*"|[^\\[\\]\\(\\)\\{\\}"]*)*)(\\]\\]|\\]\\)|\\)\\)|\\}\\}|\\]|\\)|\\}|>)'),
    (_, id, open, _lbl, close) => trimmed ? id + open + quoteLabel(trimmed) + close : id
  );
  setCode(lines.join('\n'));
}

export function rewriteNodeShape(lineIdx, nodeId, newOpen, newClose) {
  const lines = editor.value.split('\n');
  lines[lineIdx] = lines[lineIdx].replace(
    new RegExp('(\\b' + escapeRegex(nodeId) + ')(\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|>)((?:"[^"]*"|[^\\[\\]\\(\\)\\{\\}"]*)*)(\\]\\]|\\]\\)|\\)\\)|\\}\\}|\\]|\\)|\\}|>)'),
    (_, id, _open, label) => id + newOpen + label + newClose
  );
  setCode(lines.join('\n'));
}

export function rewriteEdgeLabel(lineIdx, fromId, toId, newLabel) {
  const lines = editor.value.split('\n');
  const line = lines[lineIdx];
  const trimmed = (newLabel || '').trim();
  const inner = trimmed
    ? (needsQuoting(trimmed) ? '"' + trimmed.replace(/"/g, '&quot;') + '"' : trimmed)
    : '';

  // Groups:
  //   1 = before-arrow segment ending at fromId
  //   2 = arrow operator (from EDGE_RE's own capture)
  //   3 = optional existing "|label|"
  //   4 = after-arrow segment ending at toId
  const segmentRe = new RegExp(
    '(\\b' + escapeRegex(fromId) + '\\b[^-=.<>]*?)' + EDGE_RE.source + '(\\s*\\|[^|]*\\|)?([^-=.<>|]*?\\b' + escapeRegex(toId) + '\\b)'
  );
  const m = line.match(segmentRe);
  if (!m) return;

  const [, before, op, existing, after] = m;
  let replacement;
  if (existing) {
    replacement = before + op + (trimmed ? '|' + inner + '|' : '') + after;
  } else if (trimmed) {
    replacement = before + op + '|' + inner + '|' + after;
  } else {
    return;
  }
  lines[lineIdx] = line.replace(segmentRe, replacement);
  setCode(lines.join('\n'));
}

export function rewriteEdgeStyle(lineIdx, fromId, toId, newOp) {
  const lines = editor.value.split('\n');
  const line = lines[lineIdx];
  const updated = line.replace(
    new RegExp('(\\b' + escapeRegex(fromId) + '\\b[^-=.]*?)' + EDGE_RE.source + '([^-=.]*?\\b' + escapeRegex(toId) + '\\b)'),
    (_, before, _op, after) => before + newOp + after
  );
  lines[lineIdx] = updated;
  setCode(lines.join('\n'));
}

export function deleteNode(nodeId) {
  if (!renderState) return;
  const lines = editor.value.split('\n');
  const keep = lines.filter((line, i) => {
    const t = line.trim();
    if (i === (renderState.byElementId.get(nodeId) || {}).line) {
      const nm = t.match(NODE_OPEN);
      if (nm && nm[1] === nodeId && !EDGE_RE.test(t)) return false;
    }
    if (EDGE_RE.test(t)) {
      const edgeIds = [...renderState.byElementId.entries()]
        .filter(([k, v]) => v.kind === 'edge' && v.line === i)
        .map(([k]) => k);
      if (edgeIds.some(k => k.startsWith(nodeId + '-') || k.endsWith('-' + nodeId))) return false;
    }
    if (t.startsWith('style ' + nodeId + ' ') || t.match(new RegExp('\\bclass\\b.*\\b' + escapeRegex(nodeId) + '\\b'))) return false;
    return true;
  });
  setCode(keep.join('\n'));
}

export function deleteEdge(edgeKey, lineIdx) {
  const lines = editor.value.split('\n');
  const line = lines[lineIdx];
  const [fromId, toId] = edgeKey.split('-');
  const withoutEdge = line.replace(
    new RegExp('\\s*\\b' + escapeRegex(fromId) + '\\b[^-=.]*?' + EDGE_RE.source + '[^-=.]*?\\b' + escapeRegex(toId) + '\\b\\s*'),
    ' '
  ).trim();
  if (!withoutEdge) lines.splice(lineIdx, 1);
  else lines[lineIdx] = withoutEdge;
  setCode(lines.join('\n'));
}

export function wrapInSubgraph(nodeId, lineIdx) {
  const lines = editor.value.split('\n');
  let n = 1;
  while (editor.value.includes('subgraph SG_' + n)) n++;
  lines.splice(lineIdx, 0, '    subgraph SG_' + n + '[Group]');
  lines.splice(lineIdx + 2, 0, '    end');
  setCode(lines.join('\n'));
}

// ─── Context Menu ───

let ctxSubmenu = null;

function hideMenu() {
  ctxMenu.hidden = true;
  if (ctxSubmenu) { ctxSubmenu.remove(); ctxSubmenu = null; }
}

function showMenu(x, y, items) {
  hideMenu();
  ctxMenu.textContent = '';
  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxMenu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    const label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(label);
    if (item.submenu) {
      const arrow = document.createElement('span');
      arrow.className = 'ctx-arrow';
      arrow.textContent = '▶';
      el.appendChild(arrow);
      el.addEventListener('mouseenter', () => {
        if (ctxSubmenu) { ctxSubmenu.remove(); ctxSubmenu = null; }
        const sub = document.createElement('div');
        sub.className = 'ctx-submenu';
        item.submenu.forEach(si => {
          const sel = document.createElement('div');
          sel.className = 'ctx-item';
          sel.textContent = si.label;
          sel.addEventListener('click', () => { hideMenu(); si.action(); });
          sub.appendChild(sel);
        });
        const r = el.getBoundingClientRect();
        const subX = Math.min(r.right + 2, window.innerWidth - 170);
        const subY = Math.min(r.top, window.innerHeight - sub.children.length * 34 - 12);
        sub.style.left = subX + 'px';
        sub.style.top = subY + 'px';
        document.body.appendChild(sub);
        ctxSubmenu = sub;
      });
    } else if (item.action) {
      el.addEventListener('click', () => { hideMenu(); item.action(); });
    }
    ctxMenu.appendChild(el);
  });
  const clampX = Math.min(x, window.innerWidth - 200);
  const clampY = Math.min(y, window.innerHeight - items.length * 34 - 12);
  ctxMenu.style.left = clampX + 'px';
  ctxMenu.style.top = clampY + 'px';
  ctxMenu.hidden = false;
}

const SHAPES = [
  { label: 'Rectangle  [ ]',       open: '[',  close: ']'  },
  { label: 'Round  ( )',            open: '(',  close: ')'  },
  { label: 'Stadium  ([ ])',        open: '([', close: '])' },
  { label: 'Subroutine  [[ ]]',     open: '[[', close: ']]' },
  { label: 'Cylinder  [( )]',       open: '[(', close: ')]' },
  { label: 'Circle  (( ))',         open: '((', close: '))' },
  { label: 'Diamond  { }',          open: '{',  close: '}'  },
  { label: 'Hexagon  {{ }}',        open: '{{', close: '}}' },
  { label: 'Asymmetric  >]',        open: '>',  close: ']'  },
];

const ARROW_STYLES = [
  { label: '--> Arrow',      op: '-->'   },
  { label: '--- Line',       op: '---'   },
  { label: '==> Thick arrow', op: '==>'  },
  { label: '-.- Dotted',     op: '-.->',  },
  { label: '<--> Both ways', op: '<-->'  },
];

function menuItemsFor(entry, sourceId) {
  const aiAction = () => {
    const tmpl = 'Transform this ' + entry.kind + ' ("' + sourceId + '") on line ' + (entry.line + 1) + ': ';
    chatInput.value = tmpl;
    chatInput.focus();
    chatInput.setSelectionRange(tmpl.length, tmpl.length);
  };

  if (entry.kind === 'node') {
    return [
      { label: 'Rename node…', action: () => {
        const newId = window.prompt('New node ID:', sourceId);
        if (!newId || newId === sourceId) return;
        if (!/^[A-Za-z_][\w-]*$/.test(newId)) {
          window.alert('Node IDs must start with a letter or underscore and contain only letters, digits, underscores, or hyphens.');
          return;
        }
        setCode(editor.value.replace(new RegExp('\\b' + escapeRegex(sourceId) + '\\b', 'g'), newId));
      }},
      { label: 'Edit label…', action: () => {
        const m = entry.raw.match(new RegExp('\\b' + escapeRegex(sourceId) + '(?:\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|>)((?:"[^"]*"|[^\\[\\]\\(\\)\\{\\}"]*)*)'));
        const cur = m ? m[1].replace(/^"|"$/g, '') : '';
        const label = window.prompt(m ? 'Edit label:' : 'Add label:', cur);
        if (label == null) return;
        if (m) {
          rewriteNodeLabel(entry.line, sourceId, label);
        } else if (renderState && renderState.diagramType === 'state') {
          if (!label) return;
          const lines = editor.value.split('\n');
          const stateLineRe = new RegExp('^(\\s*state\\s+)"[^"]*"(\\s+as\\s+' + escapeRegex(sourceId) + '\\s*)$');
          const existingIdx = lines.findIndex(l => stateLineRe.test(l));
          if (existingIdx >= 0) {
            lines[existingIdx] = lines[existingIdx].replace(stateLineRe, (_, pre, post) => pre + '"' + label + '"' + post);
          } else {
            const headerIdx = lines.findIndex(l => /^\s*stateDiagram/.test(l));
            lines.splice(headerIdx >= 0 ? headerIdx + 1 : entry.line + 1, 0, '    state "' + label + '" as ' + sourceId);
          }
          setCode(lines.join('\n'));
        } else {
          const lines = editor.value.split('\n');
          lines[entry.line] = lines[entry.line].replace(
            new RegExp('\\b' + escapeRegex(sourceId) + '\\b'),
            sourceId + '[' + quoteLabel(label) + ']'
          );
          setCode(lines.join('\n'));
        }
      }},
      { label: 'Change shape', submenu: SHAPES.map(s => ({
        label: s.label,
        action: () => rewriteNodeShape(entry.line, sourceId, s.open, s.close),
      }))},
      { label: 'Add edge from here', action: () => startAddEdge(sourceId) },
      { label: 'Wrap in subgraph', action: () => wrapInSubgraph(sourceId, entry.line) },
      { label: 'Add styling…', action: () => {
        const frag = window.prompt('CSS-like style fragment (e.g. fill:#f9f,stroke:#333):', '');
        if (frag) {
          const lines = editor.value.split('\n');
          lines.push('style ' + sourceId + ' ' + frag);
          setCode(lines.join('\n'));
        }
      }},
      'sep',
      { label: 'AI: transform this…', action: aiAction },
      'sep',
      { label: 'Delete node', danger: true, action: () => {
        if (window.confirm('Delete node "' + sourceId + '" and its edges?')) deleteNode(sourceId);
      }},
    ];
  }

  if (entry.kind === 'edge') {
    const renameAction = () => {
      const labelM = (entry.raw || '').match(/\|([^|]*)\|/);
      const cur = labelM ? labelM[1].replace(/^"|"$/g, '').replace(/&quot;/g, '"') : '';
      const next = window.prompt(labelM ? 'Edit edge label (blank to remove):' : 'Add edge label:', cur);
      if (next == null) return;
      rewriteEdgeLabel(entry.line, entry.from, entry.to, next);
    };
    return [
      { label: 'Rename edge…', action: renameAction },
      { label: 'Change arrow style', submenu: ARROW_STYLES.map(s => ({
        label: s.label,
        action: () => rewriteEdgeStyle(entry.line, entry.from, entry.to, s.op),
      }))},
      'sep',
      { label: 'AI: transform this…', action: aiAction },
      'sep',
      { label: 'Delete edge', danger: true, action: () => deleteEdge(sourceId, entry.line) },
    ];
  }

  if (entry.kind === 'cluster') {
    return [
      { label: 'Rename…', action: () => {
        const cur = (entry.raw.match(/subgraph\s+\w+\s*\[?([^\]]*)\]?/) || [])[1] || sourceId;
        const label = window.prompt('New subgraph label:', cur.replace(/^"|"$/g, '').trim());
        if (label != null) {
          const lines = editor.value.split('\n');
          lines[entry.line] = lines[entry.line].replace(/\[([^\]]*)\]/, '[' + label + ']');
          setCode(lines.join('\n'));
        }
      }},
      { label: 'Add styling…', action: () => {
        const frag = window.prompt('CSS style (e.g. fill:#f9f):', '');
        if (frag) {
          const lines = editor.value.split('\n');
          lines.push('style ' + sourceId + ' ' + frag);
          setCode(lines.join('\n'));
        }
      }},
      'sep',
      { label: 'AI: transform this…', action: aiAction },
    ];
  }

  return [];
}

diagramContent.addEventListener('contextmenu', e => {
  if (!renderState) return;
  if (pendingEdge) return;
  const el = e.target.closest('[data-ms-id]');
  if (!el) return;
  e.preventDefault();
  const sourceId = el.dataset.msId;
  const entry = renderState.byElementId.get(sourceId);
  if (!entry) return;
  const items = menuItemsFor(entry, sourceId);
  if (!items.length) return;
  showMenu(e.clientX, e.clientY, items);
});

document.addEventListener('mousedown', e => {
  if (ctxMenu && !ctxMenu.hidden && !ctxMenu.contains(e.target) && (!ctxSubmenu || !ctxSubmenu.contains(e.target))) {
    hideMenu();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!ctxMenu.hidden) { hideMenu(); return; }
    if (pendingEdge) cancelAddEdge();
  }
});

// ─── Add Edge State Machine ───

let edgeBanner = null;

function startAddEdge(fromId) {
  setPendingEdge({ fromId });
  if (!edgeBanner) {
    edgeBanner = document.createElement('div');
    edgeBanner.className = 'ctx-add-edge-banner';
    document.body.appendChild(edgeBanner);
  }
  edgeBanner.textContent = 'Click target node to add edge from "' + fromId + '" — Esc to cancel';
  edgeBanner.style.display = 'block';
  diagramContent.style.cursor = 'crosshair';
}

function cancelAddEdge() {
  setPendingEdge(null);
  if (edgeBanner) edgeBanner.style.display = 'none';
  diagramContent.style.cursor = '';
}

diagramContent.addEventListener('click', e => {
  if (!pendingEdge) return;
  const el = e.target.closest('[data-ms-id]');
  if (!el) { cancelAddEdge(); return; }
  const toId = el.dataset.msId;
  if (renderState && renderState.byElementId.get(toId) && renderState.byElementId.get(toId).kind === 'node') {
    const lines = editor.value.split('\n');
    lines.push('    ' + pendingEdge.fromId + ' --> ' + toId);
    setCode(lines.join('\n'));
  }
  cancelAddEdge();
});

// ─── Help Modal ───

let helpLoaded = false;

async function openHelp() {
  helpModal.hidden = false;
  if (helpLoaded) return;
  try {
    const res = await fetch('/HELP.md');
    const md = await res.text();
    helpContent.textContent = '';
    if (window.marked) {
      helpContent.appendChild(document.createRange().createContextualFragment(window.marked.parse(md)));
    } else {
      const pre = document.createElement('pre');
      pre.textContent = md;
      helpContent.appendChild(pre);
    }
    helpLoaded = true;
  } catch {
    helpContent.textContent = "Couldn't load HELP.md.";
  }
}

function closeHelp() { helpModal.hidden = true; }

helpBtn.addEventListener('click', openHelp);
helpModal.addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeHelp(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !helpModal.hidden) closeHelp(); });
