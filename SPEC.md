# SPEC: Composer "New session" + "Compress" actions

## 1. Objective

Add two buttons to the chat composer's actions row:

- **New session** (`SquarePen`): start a fresh agent session (no resume / fresh context) without losing the visible thread.
- **Compress** (`Shrink`): compact the conversation so the agent continues with a smaller context.

Both must be **harness-agnostic**: they work through the existing capability-detected harness contract, not Claude-specific calls, so any current or future harness (codex, gemini-cli, opencode, pi, …) participates by declaring a capability and a recipe, never by the widget special-casing a CLI.

Target user: the developer using the in-page conciv agent who wants to reset context or shrink a long conversation, mirroring Claude Code's `/clear` and `/compact` UX.

### Key UX decision (from product)

Neither action **wipes** the scrollback. The prior thread stays rendered and scrollable; a **boundary divider** marks where the old session/context ends and the new one begins, exactly like Claude Code, where after `/clear` or `/compact` you can still scroll up to the pre-boundary history.

- **New session** → server drops the resume pointer; UI inserts a `New session` divider; the context tracker resets. The next message streams below the divider as a fresh session. Messages above the divider remain visible.
- **Compress** → runs a compaction turn; UI inserts a `Context compacted` divider; the streamed summary renders below it. Messages above remain visible.

## 2. Design

### 2.1 Compaction is tiered (universal button, per-harness mechanism)

The Compress button is **always visible** because every harness gets at least the fallback. The mechanism is chosen **server-side** from harness capability; the widget never knows which path ran:

| Harness supports real compaction         | Mechanism                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| yes (`capabilities.compaction === true`) | spawn the harness's native compaction recipe (`buildCompactArgs`) against the resumed session; genuinely frees the harness context window.                                                 |
| no (`capabilities.compaction === false`) | spawn a normal turn with a built-in "summarize our conversation concisely so we can continue" prompt. Best-effort: produces a summary in-thread but does **not** free the resumed context. |

> **Validated for claude (CLI 2.1.177):** `claude -p "/compact" --resume <id> --output-format stream-json` works. It emits `{"type":"system","subtype":"status","status":"compacting"}` then `{"type":"system","subtype":"compact_boundary"}`, finishes `is_error:false`, keeps the same `session_id`, and writes `isCompactSummary:true` + `compactMetadata` + `isVisibleInTranscriptOnly:true` entries to the transcript. **It streams NO assistant text** (`result:""`, `num_turns:0`); the summary is applied internally to the session, not returned. So a real compaction turn produces only a divider in the UI; there is nothing to render below it. The next turn resumes the now-compacted context.

New session needs **no** capability flag: starting fresh is the absence of resume, which every harness already supports (resume is gated by `capabilities.resume` and a null `resumeSessionId`).

### 2.2 Server contract

**New route: reset session**

```
POST /api/chat/session/new   → { ok: true }
```

Clears `state.sessionId` and removes the persisted session pointer (`writeSession` with empty / a new `clearSession`). Harness-agnostic: the next `POST /api/chat` sees `state.sessionId === ''`, computes `resumeSessionId = null`, and spawns fresh for any harness (claude omits `--resume`, codex uses `exec` not `exec resume`, etc.).

**Existing route: add a compaction intent**

`ChatRequestSchema` (`packages/protocol/src/chat-types.ts`) gains:

```ts
intent: z.enum(['chat', 'compact']).optional() // default 'chat'
```

In `POST /api/chat` (`turn.ts`), when `intent === 'compact'`:

- `resumeSessionId` MUST resolve to the current session (compaction operates on existing context); 409 still applies if the lock is held.
- thread the intent down to the adapter so it selects the compaction arg-builder.

Routing compaction through the **existing** turn route (not a new streaming endpoint) reuses lock handling, the decode pipeline, SSE framing, usage persistence, and `onSessionId` unchanged.

### 2.3 Harness contract (the future-proof part)

`packages/protocol/src/harness-types.ts`:

- `HarnessCapabilities` gains `compaction: boolean`.
- `HarnessTurn` gains `kind?: 'chat' | 'compact'` (default `'chat'`).
- Type-enforce the recipe the same way `transcriptHistory` enforces `history`. The adapter union requires `buildCompactArgs` iff `compaction: true`:

```ts
export type HarnessAdapter = HarnessAdapterBase &
  ({ capabilities: …{transcriptHistory: true};  history: HarnessHistory }
   | { capabilities: …{transcriptHistory: false}; history?: undefined }) &
  ({ capabilities: …{compaction: true};  buildCompactArgs: HarnessArgsBuilder }
   | { capabilities: …{compaction: false}; buildCompactArgs?: undefined })
```

So a `compaction:true` adapter without `buildCompactArgs` is a **compile error**. New harnesses opt in by implementing the builder, never by widget changes.

`packages/harness/src/_shared/text-adapter.ts` (`chatStream`):

- `HarnessAdapterDeps` gains `turnKind?: 'chat' | 'compact'`.
- the assembled `turn` carries `kind: deps.turnKind ?? 'chat'`.
- arg selection:
  ```ts
  const args =
    turn.kind === 'compact' && harness.capabilities.compaction
      ? harness.buildCompactArgs(turn)
      : harness.buildArgs(turn)
  ```
  When `kind === 'compact'` but the harness has no compaction, `chatStream` falls back to `buildArgs` with the summarize prompt (the route supplies that prompt as the turn text).

Per-harness initial wiring:

- **claude**: `compaction: true` (validated, see §2.1). `buildCompactArgs` mirrors `buildClaudeArgs` but sends `/compact` as the prompt, keeps `--resume`, and drops image refs (irrelevant to compaction). `claudeToAguiEvents` must tolerate the new `system/compact_boundary` and `status:compacting` events (skip them as it already skips unknown system subtypes; verify). `claudeHistory.parse` must handle `isCompactSummary` / `isVisibleInTranscriptOnly` transcript entries so post-compaction hydrate doesn't crash and shows a sensible thread.
- **codex, gemini-cli, opencode, pi**: `compaction:false` initially (fallback path). They opt into real compaction later by adding `buildCompactArgs` as their CLIs gain headless compaction.

### 2.4 Widget contract

**Extend the composer-action capability bag** (`ComposerActionContext` in `widget-shell.tsx`). The bag is explicitly designed to grow (see its existing comment). Both buttons are one-shot `ComposerActionDef`s (like the element picker), so they register via the existing `registerComposerAction`. The bag gains thread/session primitives the panel owns:

```ts
export type ComposerActionContext = {
  apiBase: string
  insert: (text: string) => void
  setBusy: (busy: boolean) => void
  // session/thread lifecycle: the composer owns thread state, actions drive it through these:
  sendTurn: (text: string, meta?: Record<string, unknown>) => void // one-shot request-meta merged for this turn only
  addDivider: (kind: 'new' | 'compact') => void // insert a session boundary into the scrollback
  resetUsage: () => void // clear the context tracker
}
```

**Two new first-party action defs** (new files under `packages/widget/src/`, registered in `mount.tsx` alongside `elementPickerAction`):

- `newSessionAction`, `onClick`: `await fetch POST /api/chat/session/new`; `addDivider('new')`; `resetUsage()`. No turn runs; the divider + cleared tracker mark the fresh start. Next user message streams fresh.
- `compactAction`, `onClick`: `await ctx.compact()`. `compact()` runs the compaction turn **out of band** (a direct `fetch` to `/api/chat` with `forwardedProps.intent:'compact'`, NOT through `useChat`), so the thread shows **only the divider**: no `/compact` command bubble and no streamed summary, matching Claude Code. The SSE response is drained to completion (closing early would abort the dev server's child mid-compaction) and discarded; post-compaction usage is refreshed via `GET /api/chat/session`. claude runs native `/compact` (emits no text anyway); harnesses without native compaction run a summarize turn whose output is likewise drained and discarded. Compose state: a `compacting` signal blocks `submit` and disables Send while a compaction is in flight.

Icon: `FoldVertical` (content folding together), not `Shrink`.

While the compaction turn is in flight: the Send button is replaced by an **Ark UI `Progress`** indeterminate spinner (`role="status"`), and the boundary divider reads **"Compacting…"** (accent tint, spinning icon), flipping to **"Context compacted"** only when the turn actually finishes. Both are driven by one `pendingCompactId` signal, so the label never claims done while still running. `/compact` reports no numeric progress (only compacting→done), so the spinner is honestly indeterminate.

**Thread dividers**: `ChatPanel` holds a client-only `dividers` signal: `{afterCount: number; kind: 'new' | 'compact'}[]`, where `afterCount` is `chat.messages().length` at insert time. The message render loop emits a `.pw-chat-divider` element before the message whose index equals an `afterCount`. Scrollback above is untouched and remains scrollable.

- New `chat-api.ts` method: `newSession: () => Promise<Response>` → `POST /api/chat/session/new`.
- New SSE plumbing: `sendTurn` merges `meta` into `requestMeta` for exactly one turn, then sends. (The `intent` rides the POST body the same way `model` already does.)

**Styles**: add `.pw-chat-divider` (a centered, labelled horizontal rule) to `styles.css`; reuse `.pw-chat-act` for the two buttons.

### 2.5 Boundaries / known limitations

- Dividers + retained scrollback are **client-side, for the panel's lifetime**. On page reload, `hydrate` fetches history for the _current_ session id only; pre-boundary threads and dividers do not survive a reload. Persisting boundaries server-side is a future enhancement, explicitly out of scope.
- The summarize fallback does not actually free the harness context (full transcript still resumes); only real compaction does. The divider label is identical for both; the distinction is intentionally invisible to the user.

## 3. Affected files

| File                                                           | Change                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/protocol/src/harness-types.ts`                       | `capabilities.compaction`; `HarnessTurn.kind`; adapter union enforces `buildCompactArgs`. |
| `packages/protocol/src/chat-types.ts`                          | `ChatRequestSchema.intent`.                                                               |
| `packages/harness/src/_shared/text-adapter.ts`                 | thread `turnKind` → `turn.kind`; select `buildCompactArgs`.                               |
| `packages/harness/src/claude/{index,args}.ts`                  | `compaction` flag + `buildCompactArgs` (pending validation).                              |
| `packages/harness/src/{codex,gemini-cli,opencode,pi}/index.ts` | `compaction: false`.                                                                      |
| `packages/core/src/api/chat/session.ts`                        | `POST /api/chat/session/new`.                                                             |
| `packages/core/src/api/chat/turn.ts`                           | read `intent`; pass `turnKind`; force resume on compact.                                  |
| `packages/core/src/store/session-store.ts`                     | a `clearSession` (or empty-write) helper.                                                 |
| `packages/widget/src/widget-shell.tsx`                         | extend `ComposerActionContext`.                                                           |
| `packages/widget/src/chat-panel.tsx`                           | provide the new ctx primitives; `dividers` signal + render.                               |
| `packages/widget/src/chat-api.ts`                              | `newSession`.                                                                             |
| `packages/widget/src/new-session-action.tsx` (new)             | `newSessionAction`.                                                                       |
| `packages/widget/src/compact-action.tsx` (new)                 | `compactAction` + `SUMMARIZE_PROMPT`.                                                     |
| `packages/widget/src/mount.tsx`                                | register both actions.                                                                    |
| `packages/widget/src/styles.css`                               | `.pw-chat-divider`.                                                                       |

## 4. Commands

- Build / typecheck: `turbo build` (per repo convention; never manual `dist` rebuilds).
- Widget UI verification: real-browser Playwright IT (`packages/widget/test/widget.it.test.ts`), `browser.newPage()` (never `newContext()`, never jsdom).
- Core/harness unit + IT: existing vitest suites (`packages/core/test/api/chat/chat.it.test.ts`, `packages/harness/test/claude-adapter.test.ts`).

## 5. Testing strategy

**Harness (unit)**

- `buildClaudeArgs` compact path emits the compaction recipe (when enabled) and keeps `--resume`.
- adapter union: a `compaction:true` adapter without `buildCompactArgs` fails to typecheck (compile-time guard, asserted by a type-level test or the build).
- `text-adapter` picks `buildCompactArgs` for `kind:'compact'` and falls back to `buildArgs` when the harness lacks compaction.

**Core (IT)**

- `POST /api/chat/session/new` clears session state → the next `POST /api/chat` spawns with no resume (assert argv has no `--resume` / no `exec resume`).
- `POST /api/chat` with `intent:'compact'` on a compaction-capable harness uses the compact builder; on a non-capable harness streams a normal turn from the summarize prompt.
- compact turn is rejected (409) while the lock is held.

**Widget (real-browser IT)**

- clicking New session inserts a `New session` divider, leaves prior messages visible/scrollable, and clears the context tracker.
- clicking Compress inserts a `Context compacted` divider and streams a reply below it; scrollback above is preserved.
- both buttons render in the actions row with the correct `aria-label` / tooltip and lucide glyph.

## 6. Code style

Follow the existing widget/harness conventions: functions not classes (the one `BaseTextAdapter` subclass is the sanctioned exception); single-line comments; Solid `<Index>` for token-streamed lists; Ark UI under the shadow root via `EnvironmentProvider`; zod at the route boundary; capability-detected harness behavior (no CLI special-casing in core/widget). v0: reshape `ComposerActionContext` freely and update all call sites (the element picker), no back-compat shim.

## 7. Boundaries

**Always**

- Detect behavior by harness capability; keep core/widget CLI-agnostic.
- Preserve scrollback on both actions; only insert a divider.
- Reuse the existing turn route + decode/SSE pipeline for compaction.

**Ask first**

- Persisting dividers / pre-boundary threads across page reloads (out of current scope).
- Adding a confirmation dialog to New session (product chose immediate, divider-preserving reset).

**Never**

- Wipe the visible thread.
- Hard-code `/compact` or any claude-specific call in core or the widget.
- Add an npm dependency without approval; introduce jsdom/happy-dom; use `newContext()` in widget ITs.

## 8. Open validation items

1. ~~Does headless `claude -p "/compact" --resume <id>` compact?~~ **RESOLVED: yes** (CLI 2.1.177, see §2.1). claude ships `compaction:true`. Two follow-ons fall out of this (now baked into §2.3): decode must skip `compact_boundary`/`status` events, and `claudeHistory.parse` must handle compact-summary transcript entries.
2. Confirm `sendTurn('', …)` vs. a non-empty synthetic prompt. `useChat.sendMessage` likely rejects empty text, so the summarize prompt doubles as the carrier and the user-facing bubble treatment (hidden vs. shown as a command) is settled in execution.
