# AGENT.md

Working notes for AI agents (and humans) maintaining this repo.

## What's built

- Three-pane SPA: editor, live preview, AI chat.
- Static frontend (`index.html` / `index.css` / `js/`); `server.js` proxies chat to OpenRouter.
- Mermaid 11.14.0 via jsDelivr; `marked` 14 for the help modal.
- AI chat scoped to Mermaid via system prompt; off-topic prompts refused.
- Editor: line numbers, tab-to-4-spaces, debounced render (~400 ms).
- Preview: wheel zoom (re-rasterised), drag pan, double-click fit.
- Chat: per-chat history in `localStorage` (`mermaid-studio:v1`), titles auto-derived from first user message, timestamps on bubbles, auto-apply of assistant mermaid replies, **↗ Insert into Editor** for rollback.
- Multi-chat: dropdown + **+** new + **×** delete (confirm). Empty store / last-deleted seeds with first example.
- Examples dropdown: Flowchart, Sequence, Class, State, Gantt, Sankey, Architecture, Radar, Tree, XY Chart.
- File `↑ Upload` (any text → new chat titled with filename, seeded with diagram message) and `↓ Download` (saves editor as `<chat-title>.mmd`).
- Help modal: `?` button → fetches `HELP.md`, renders with marked, Esc/×/backdrop to close.
- `MODEL` constant in `js/config.js` for swapping the OpenRouter model.
- Interactive preview: right-click rendered SVG nodes/edges/clusters → context menu. Bidirectional hover between gutter and SVG (`data-ms-id` attribute links them). Source map (`renderState`) rebuilt on every successful render.

## Conventions

- No build step, no framework. Vanilla JS as native ES modules (`js/` subdirectory).
- Entry point: `<script type="module" src="./js/main.js">` in `index.html`.
- Module files: `js/config.js`, `js/dom.js`, `js/store.js`, `js/diagram.js`, `js/editor.js`, `js/chat.js`, `js/ui.js`, `js/main.js`.
- Dep order (no cycles): config → dom → store → diagram → editor → chat → ui → main.
- CDN globals (`mermaid`, `marked`) remain on `window` — accessible from any module.
- Mutable shared state lives in `store.js` as live `export let` bindings; only store.js reassigns them (e.g. `setActiveChat`, `setChatLoading`, `setPendingEdge`).
- Don't add npm deps — server uses Node built-ins only.
- Keep CSS in `index.css`. Don't reintroduce inline `<style>`.
- Server serves `js/` modules via a wildcard `/js/*` handler using `path.basename` for path-traversal safety. Add new JS files to `js/` — no server changes needed.
- Greeting message is **ephemeral** (UI only, never persisted). The `showGreeting` flag distinguishes new-chat from file/example seeding.
- Auto-applying replies relies on the first ` ```mermaid ` block in the assistant message. Don't change that contract without updating both ends.
- Prompt tweaks live in `sendMessage()`; they include scope guardrails and Mermaid label-quoting rules — don't drop those.
- SVG is inserted via `document.createRange().createContextualFragment(svg)` (not innerHTML) to satisfy the security hook. Do not revert to innerHTML assignment.
- **Known regression:** context-menu edits call `setCode()` which replaces `editor.value`, blowing the textarea undo stack. `Cmd-Z` will not undo menu edits. Fix later with `document.execCommand('insertText')` per operation.

## Changelog

| Commit | Summary |
| --- | --- |
| `f3fcd9c` | Initial commit |
| `d647bd3` | Switch to OpenRouter |
| `e9e322b` | Chat persistence + re-rasterising zoom/pan |
| `e0b32d4` | Load and Download buttons |
| `d658b56` | Skip greeting on file load |
| `13c6c15` | Ephemeral greeting (UI only) |
| `a991e4f` | Timestamps on chat bubbles |
| `e31c22f` | Drop day-of-week from timestamp |
| `7b884b6` | Rename Load → Upload |
| `3a42437` | Rename "AI" pane label → "CHAT" |
| `265baa4` | Examples buttons → dropdown |
| `e8f0b84` | Keep file extension in chat title |
| `fc47bf4` | Quote Mermaid labels (prompt rule) |
| `b9db957` | Topic guardrails in system prompt |
| `2e13336` | Sankey example |
| `aa109f6` | Architecture / Radar / Tree / XY Chart examples |
| `2e4fa3a` | Mermaid → 11.14.0 (for radar-beta) |
| `edb0406` | Examples open as new chats titled `Example - <Label>` |
| `5d31c55` | Send editor contents to assistant per turn |
| `ca27cd6` | Seed loaded chats with the diagram as the first message |
| `3e28a83` | Auto-apply assistant mermaid replies |
| `f25dea3` | Split into `index.html` / `index.js` / `index.css` |
| `b07c33a` | Drop `DEFAULT_CODE`; first example as fallback |
| `b1335e1` | `HELP.md` + scrollable help modal (marked) |
| `6ed6c4b` | Lift model to `MODEL` constant |
| *(local)*  | Split `index.js` into ES modules in `js/` |

## Next steps

<!-- Add ideas, bugs, or planned work below. Keep terse. -->

- [ ] Verify/fix `domIdToSourceId` for each diagram type by inspecting actual mermaid 11.14.0 SVG output in DevTools — node/edge id prefixes may differ from assumptions.
- [ ] Extend hover + context menu to sequence, gantt, sankey, radar, xychart (need bespoke parsers).
- [ ] Fix undo-stack regression: replace `setCode()` calls in rewrite ops with `document.execCommand('insertText')` equivalents.

### Ideas / known gaps

- Context menu multi-select (e.g. wrap multiple nodes in subgraph) — deferred.
- In-textarea-body hover (mouse Y / lineHeight) — deferred; gutter hover ships first.
- Keyboard navigation of context menu — mouse-only in v1.
