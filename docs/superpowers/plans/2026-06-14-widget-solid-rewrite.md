# Widget Solid Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `@aidx/widget` from React to SolidJS, removing all React, keeping behavior 1:1 (Solid-idiomatic cleanup allowed), with the existing Chromium playwright IT as the parity gate.

**Architecture:** Swap the framework only. `@tanstack/ai-solid` replaces `@tanstack/ai-react` (identical `useChat`/`fetchServerSentEvents`/`createChatClientOptions` API). The 5 `.tsx` files are ported to Solid; the pure-TS files (`page-*`, `shadow`, `chat-api`, `css.d.ts`) are untouched. The existing React source is the behavioral spec for each ported file.

**Tech Stack:** SolidJS 1.x, `@tanstack/ai-solid` 0.13.4, `@tanstack/ai-client` (types), `vite-plugin-solid`, marked, shiki, vite lib build (ESM + IIFE), vitest + playwright.

**HARD RULES:** Functions not classes. No IIFEs. No `index.ts`. No casts (`as` except `as const`), no `!`. Terse comments — **never more than 1 line**. Commit to `main`. Verify library APIs against real online docs.

**React→Solid mapping (applies to every ported file):**

- `useState(x)` → `const [v, setV] = createSignal(x)`; read as `v()`.
- `useEffect(fn, deps)` → `createEffect(fn)` (tracks reads); mount-only → `onMount`; teardown → `onCleanup`.
- `useMemo(fn, deps)` → `createMemo(fn)`.
- `useRef` → a plain local variable; element refs via `ref={el => ...}` or `let el; <div ref={el}>`.
- Lists → `<For each={items()}>{item => ...}</For>`. Conditionals → `<Show when={cond()}>` / `<Switch><Match>`.
- Props are NOT destructured (Solid loses reactivity) — read `props.x` inline or via `splitProps`.
- Event handlers: `onClick`/`onInput` (Solid uses `onInput`, not `onChange`, for live text).
- No `key` prop; `<For>` keys by reference.

---

## Task 1: Dependencies + build config

**Files:**

- Modify: `packages/widget/package.json`
- Modify: `packages/widget/tsconfig.json`
- Modify: `packages/widget/vite.config.ts`

- [ ] **Step 1: Swap dependencies in `packages/widget/package.json`**

Remove `react`, `react-dom`, `@tanstack/ai-react` from `dependencies`; remove `@types/react`, `@types/react-dom`, `@vitejs/plugin-react` from `devDependencies`. Resulting blocks:

```json
  "dependencies": {
    "@aidx/protocol": "workspace:*",
    "@tanstack/ai": "^0.28.0",
    "@tanstack/ai-client": "^0.16.3",
    "@tanstack/ai-solid": "^0.13.4",
    "marked": "^18.0.5",
    "shiki": "^4.2.0",
    "solid-js": "^1.9.5"
  },
  "devDependencies": {
    "@types/node": "^22.19.21",
    "playwright": "^1.60.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.16",
    "vite-plugin-solid": "^2.11.6",
    "vitest": "^4.1.8"
  }
```

- [ ] **Step 2: Update `packages/widget/tsconfig.json` JSX for Solid**

Change `"jsx": "react-jsx"` to:

```json
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
```

- [ ] **Step 3: Rewrite `packages/widget/vite.config.ts` to use vite-plugin-solid**

```ts
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// One entry (mount.tsx) ships two ways: an ESM module (@aidx/widget) and a self-contained IIFE
// global the plugin injects as a <script>. The Solid runtime is bundled in. styles.css is
// imported `?inline` (shadow.ts) and injected into the Shadow DOM.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.tsx', import.meta.url)),
      formats: ['es', 'iife'],
      name: 'AidxWidget',
      fileName: (format) => (format === 'iife' ? 'aidx-widget.global.js' : 'mount.js'),
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
  },
})
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: resolves `solid-js`, `@tanstack/ai-solid`, `vite-plugin-solid`; no react in `packages/widget/node_modules`.

- [ ] **Step 5: Verify react is gone from the widget**

Run: `grep -rn "react\|@tanstack/ai-react\|@vitejs/plugin-react" packages/widget/package.json packages/widget/vite.config.ts packages/widget/tsconfig.json`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add packages/widget/package.json packages/widget/tsconfig.json packages/widget/vite.config.ts pnpm-lock.yaml
git commit -m "build(widget): swap React toolchain for Solid (deps, jsx, vite plugin)"
```

> Note: the widget will not typecheck/build until the `.tsx` files are ported (Tasks 2–6). That is expected mid-rewrite; the gate is Task 7.

---

## Task 2: Port `markdown.tsx` (leaf, no chat deps)

**Files:**

- Modify: `packages/widget/src/markdown.tsx`
- Reference (behavior spec): the current React `markdown.tsx`

Port first because it is a pure render leaf used by `chat-shell`. marked + shiki produce an HTML string; shiki highlight is async.

- [ ] **Step 1: Read the current React `markdown.tsx`** to capture its exact marked options, shiki theme/langs, and the component's props (the rendered output and prop names must not change).

- [ ] **Step 2: Rewrite as a Solid component**

Render the marked output via `innerHTML`. Resolve shiki asynchronously with `createResource`, falling back to non-highlighted marked output until it resolves:

```tsx
import {createResource, Show, type Component} from 'solid-js'
import {marked} from 'marked'
// keep the SAME shiki imports/codeToHtml usage the React version used

type Props = {text: string}

export const Markdown: Component<Props> = (props) => {
  const [html] = createResource(() => props.text, renderMarkdown)
  return <div class="aidx-md" innerHTML={html() ?? marked.parse(props.text, {async: false})} />
}

// renderMarkdown: marked + shiki highlight → HTML string. Port the body verbatim from the
// React version (same theme, langs, sanitize options).
async function renderMarkdown(text: string): Promise<string> {
  // ...exact logic from current markdown.tsx...
}
```

Match the existing class names so `styles.css` still applies.

- [ ] **Step 3: Typecheck the file in isolation**

Run: `pnpm --filter @aidx/widget exec tsc --noEmit -p tsconfig.json 2>&1 | grep markdown`
Expected: no errors referencing `markdown.tsx` (other files may still error — they're ported later).

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/markdown.tsx
git commit -m "refactor(widget): port markdown.tsx to Solid"
```

---

## Task 3: Port `gen-ui.tsx`

**Files:**

- Modify: `packages/widget/src/gen-ui.tsx`
- Reference: current React `gen-ui.tsx`

- [ ] **Step 1: Read the current `gen-ui.tsx`** — note every spec `kind` it renders (e.g. confirm/choices/...) and the props/callbacks each emits. Output and callback contracts must not change.

- [ ] **Step 2: Rewrite spec→component dispatch with Solid `<Switch>`/`<Match>`** (or `<Dynamic>` if the React version used a lookup map):

```tsx
import {Switch, Match, type Component} from 'solid-js'
// import the spec types from @aidx/protocol/ui-types as the React version did

export const GenUi: Component<{spec: UiSpec; onReply: (r: Reply) => void}> = (props) => (
  <Switch>
    <Match when={props.spec.kind === 'confirm'}>{/* confirm UI, same markup/classes */}</Match>
    <Match when={props.spec.kind === 'choices'}>{/* choices UI */}</Match>
    {/* one <Match> per kind the React version handled */}
  </Switch>
)
```

Preserve every `kind`, the markup classes, and the callback payloads exactly.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aidx/widget exec tsc --noEmit -p tsconfig.json 2>&1 | grep gen-ui`
Expected: no errors referencing `gen-ui.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/gen-ui.tsx
git commit -m "refactor(widget): port gen-ui.tsx to Solid"
```

---

## Task 4: Port `test-card.tsx`

**Files:**

- Modify: `packages/widget/src/test-card.tsx`
- Reference: current React `test-card.tsx`

- [ ] **Step 1: Read the current `test-card.tsx`** — capture: props (`apiBase`, `onFix`, `result`), LIVE mode (`result === null` subscribes to `${apiBase}/api/test-runner/stream`), the pass/fail tree shape, and expand-failure interactions. Markup/classes/behavior must not change (the IT asserts the tree + expand + actions).

- [ ] **Step 2: Rewrite as Solid** — EventSource via `onMount`/`onCleanup`; tree/expansion state via `createSignal` or a `createStore`:

```tsx
import {createSignal, onCleanup, onMount, For, Show, type Component} from 'solid-js'

export const TestCard: Component<{apiBase: string; onFix: (...a: never[]) => void; result: TestRunResult | null}> = (
  props,
) => {
  const [state, setState] = createSignal(/* initial from props.result */)
  onMount(() => {
    if (props.result !== null) return
    const source = new EventSource(`${props.apiBase}/api/test-runner/stream`)
    source.onmessage = (e) => setState(parseEvent(e.data))
    onCleanup(() => source.close())
  })
  // render the same pass/fail tree + expandable failures as the React version
  return <div class="aidx-test-card">{/* ... */}</div>
}
```

Keep the exact class names and the expand/fix actions.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aidx/widget exec tsc --noEmit -p tsconfig.json 2>&1 | grep test-card`
Expected: no errors referencing `test-card.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/test-card.tsx
git commit -m "refactor(widget): port test-card.tsx to Solid"
```

---

## Task 5: Port `chat-shell.tsx` (the core)

**Files:**

- Modify: `packages/widget/src/chat-shell.tsx`
- Reference: current React `chat-shell.tsx`

- [ ] **Step 1: Read the current `chat-shell.tsx` fully** — capture: FAB open/close, the `useChat` config (`createChatClientOptions`, `fetchServerSentEvents`, chat URL from `createChatApi`), message rendering (text via `Markdown`, tool calls/results, the approval gate via `permissionDecision`), session hydration via `chat-api.history`, and `gen-ui` injection. Behavior must not change.

- [ ] **Step 2: Swap the chat import and adapt the return shape**

```tsx
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolCallState, ToolResultPart} from '@tanstack/ai-client'
```

Solid's `useChat` returns **accessors** (call them as functions in JSX), not a React snapshot object. Verify the `UseChatReturn` field names/shapes against `@tanstack/ai-solid`'s `dist/use-chat.d.ts` before wiring (e.g. `messages()`, `sendMessage`, `status()`), and render accordingly.

- [ ] **Step 3: Port the view** — `createSignal` for FAB open + input; `<For>` over `messages()`; `<Show>` for the approval gate; `Markdown`/`GenUi`/`TestCard` (now Solid) for parts. Session hydration in `onMount`. Keep all class names.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @aidx/widget exec tsc --noEmit -p tsconfig.json 2>&1 | grep chat-shell`
Expected: no errors referencing `chat-shell.tsx`.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/chat-shell.tsx
git commit -m "refactor(widget): port chat-shell.tsx to Solid (@tanstack/ai-solid useChat)"
```

---

## Task 6: Port `mount.tsx` (entry + seams)

**Files:**

- Modify: `packages/widget/src/mount.tsx`
- Reference: current React `mount.tsx`

Preserve the public contract: exports `mountWidget`, auto-mounts on load, guards against double-mount (`[data-aidx-root]`), probes via `probeChatAvailable(apiBase)` before mounting chat, and exposes the `__AIDX_RENDER_TEST_CARD__` test seam (the IT calls it).

- [ ] **Step 1: Rewrite using Solid `render`**

```tsx
import {render} from 'solid-js/web'
import {createShadowRoot} from './shadow.js'
import {ChatFeature} from './chat-shell.js'
import {TestCard} from './test-card.js'
import {initPageBus} from './page-bus.js'
import {probeChatAvailable} from './chat-api.js'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

type TestSeam = {__AIDX_RENDER_TEST_CARD__?: () => void}

function mountTestCardForTest(root: ShadowRoot, apiBase: string): void {
  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <TestCard apiBase={apiBase} onFix={() => {}} result={null} />, container)
}

export function mountWidget(): void {
  if (document.querySelector('[data-aidx-root]')) return
  const {root} = createShadowRoot()
  const apiBase = metaContent('pw-api-base')
  const w = window as unknown as TestSeam
  w.__AIDX_RENDER_TEST_CARD__ = () => mountTestCardForTest(root, apiBase)
  void probeChatAvailable(apiBase).then((available) => {
    if (!available) return
    const container = document.createElement('div')
    root.appendChild(container)
    render(() => <ChatFeature apiBase={apiBase} />, container)
    initPageBus({apiBase})
  })
}

mountWidget()
```

- [ ] **Step 2: Commit**

```bash
git add packages/widget/src/mount.tsx
git commit -m "refactor(widget): port mount.tsx to Solid render"
```

---

## Task 7: Build, typecheck, and the parity gate (browser IT)

**Files:**

- Run-only: `packages/widget`

- [ ] **Step 1: Typecheck the whole widget**

Run: `pnpm --filter @aidx/widget typecheck`
Expected: PASS (zero errors).

- [ ] **Step 2: Build the bundle**

Run: `pnpm --filter @aidx/widget build`
Expected: emits `dist/aidx-widget.global.js` and `dist/mount.js`; no react in the bundle —
verify: `grep -c "react-dom" packages/widget/dist/aidx-widget.global.js` → `0`.

- [ ] **Step 3: Run the browser IT (parity gate)**

Run: `pnpm --filter @aidx/widget test`
Expected: PASS — "mounts the FAB, streams an assistant reply, and renders the approval gate → decision" and "renders the live vitest card: pass/fail tree, expands the failure with actions".

- [ ] **Step 4: Lint**

Run: `pnpm --filter @aidx/widget lint`
Expected: PASS.

- [ ] **Step 5: Full workspace check (nothing downstream broke)**

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: all tasks succeed (the plugin serves the rebuilt `aidx-widget.global.js`).

- [ ] **Step 6: Verify no React anywhere in widget source**

Run: `grep -rn "react" packages/widget/src packages/widget/package.json`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A packages/widget
git commit -m "test(widget): Solid rewrite passes the browser parity IT"
```

---

## Self-review notes

- Spec coverage: deps (T1), build/jsx (T1), each `.tsx` file (T2–T6), pure-TS files untouched (not in any task — correct), testing gate (T7), risks (Solid `useChat` shape — T5 step 2; shiki async — T2 step 2; gen-ui dynamic — T3). All covered.
- The `__AIDX_RENDER_TEST_CARD__` seam and `pw-api-base` meta read are preserved (T6) so the IT keeps working.
- Order is leaf-first (markdown → gen-ui → test-card → chat-shell → mount) so each task typechecks against already-ported children before the parent.
