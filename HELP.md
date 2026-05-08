# Using Mermaid Studio

Mermaid Studio is a three-pane web app for writing [Mermaid](https://mermaid.js.org/) diagrams with help from an AI chat assistant.

## Layout

| Pane | What it does |
| --- | --- |
| **Editor** (left) | The Mermaid source. Edit it freely; line numbers update as you type. |
| **Preview** (middle) | The rendered diagram. Re-renders ~400 ms after you stop typing. |
| **Chat** (right) | Talk to the AI to generate or modify the diagram in the editor. |

## Top bar

- **Examples ▾** — pick a starter diagram (Flowchart, Sequence, Class, State, Gantt, Sankey, Architecture, Radar, Tree, XY Chart). Each pick opens as a new chat titled `Example - <Type>`.
- **↑ Upload** — load a `.mmd` or `.txt` file. Opens as a new chat named after the file (extension included), with the file contents seeded as the first chat message.
- **↓ Download** — save the current editor contents as `<chat-title>.mmd`.

## Editor

- Tab inserts four spaces.
- Edits auto-save into the active chat (no Save button).
- Errors show in the Preview pane with the raw message from Mermaid — fix the source and the preview catches up automatically.

## Preview pane: zoom and pan

- **Mouse wheel** — zoom in/out, centred on the cursor. The SVG is re-rasterised at each zoom level so it stays sharp.
- **Click and drag** — pan around the diagram.
- **Double-click** — reset to fit-to-pane.

## Chat pane

- Type a request and press **Enter** (or click ↑) to send. Shift+Enter inserts a newline.
- The assistant's mermaid replies are **auto-applied to the editor**. Each reply still shows a code block with **↗ Insert into Editor** so you can roll back to any earlier version with one click.
- Each turn also sends the current editor contents to the assistant, so prompts like "add B(1) and B(2) off B" act on what you're looking at.
- The assistant is scoped to Mermaid diagrams and Mermaid Studio; off-topic questions get a one-line redirect.

### Multi-chat

Above the messages:

- **Dropdown** — switch between chats. Each chat has its own diagram and history.
- **+** — start a fresh empty chat.
- **×** — delete the active chat (with a confirm). Deleting the last chat seeds a new one with the first example.

All chats persist to `localStorage` under `mermaid-studio:v1` and survive page reloads.

## Tips

- To branch, use **+** to create a new chat, then paste or upload your starting diagram.
- If a diagram fails to parse, the assistant can usually fix it — paste the error or just say "fix the syntax".
- The `Examples ▾` dropdown is also a good way to learn syntax: open one, then ask the assistant to modify it.

## Troubleshooting

- **`No diagram type detected …`** — your Mermaid version may not support that diagram (e.g. `radar-beta` needs ≥ 11.6). Mermaid Studio currently uses 11.14.0.
- **Network error in chat** — the server is down or `OPENROUTER_API_KEY` is missing/invalid.
- **Reset everything** — open DevTools → Application → Local Storage → delete `mermaid-studio:v1` and reload.
