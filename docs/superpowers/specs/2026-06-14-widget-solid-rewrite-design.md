# Widget Solid Rewrite — Design

## Goal

Rewrite `@mandarax/widget` from React to SolidJS, removing all React. Behavior stays 1:1 with the
current widget; allow Solid-idiomatic cleanup where it is clearly better. The existing Chromium
playwright IT is the acceptance gate for behavior parity.

## Decision

Use the official `@tanstack/ai-solid` (v0.13.4), which exports the same API the widget already
uses — `useChat`, `fetchServerSentEvents`, `createChatClientOptions`, plus `UIMessage` /
`MessagePart` / `ToolCallPart` / `ToolResultPart` / `ToolCallState` types. The chat client is a
near drop-in; only React's render model and JSX reactivity change.

## Dependencies (`packages/widget/package.json`)

- Remove: `react`, `react-dom`, `@tanstack/ai-react`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`
- Add: `solid-js`, `@tanstack/ai-solid`, `vite-plugin-solid`
- Keep: `@tanstack/ai-client` (framework-agnostic types), `@tanstack/ai`, `marked`, `shiki`, `@mandarax/protocol`

## Files

Rewrite (React `.tsx` → Solid `.tsx`):

| File             | Notes                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chat-shell.tsx` | `useChat` from `@tanstack/ai-solid` (returns accessors, not a render snapshot). `useState→createSignal`, `useEffect→createEffect`/`onMount`/`onCleanup`, `useMemo→createMemo`, refs as locals. Lists via `<For>`, conditionals via `<Show>`/`<Switch>`.            |
| `test-card.tsx`  | EventSource subscribe/teardown via `onMount`/`onCleanup`; pass/fail tree state via signals or a small store. LIVE mode (`result=null`) subscribes to `/api/test-runner/stream`.                                                                                    |
| `gen-ui.tsx`     | Map agent UI spec → component with Solid `<Dynamic>` / `<Switch>`.                                                                                                                                                                                                 |
| `markdown.tsx`   | marked + shiki produce an HTML string rendered via `innerHTML`. shiki's async highlight via `createResource`.                                                                                                                                                      |
| `mount.tsx`      | Solid `render(() => <ChatFeature/>, container)` into the shadow root (replaces `createRoot().render`). Preserve the `__MANDARAX_RENDER_TEST_CARD__` test seam and the `probeChatAvailable` gate. Export `mountWidget` and auto-mount on load (unchanged contract). |

Unchanged (pure TS, no framework): `page-bus.ts`, `page-driver.ts`, `page-handlers.ts`,
`page-snapshot.ts`, `shadow.ts`, `chat-api.ts`, `css.d.ts`, `styles.css`.

## Build config

- `tsconfig.json`: `jsx: "react-jsx"` → `jsx: "preserve"`, add `jsxImportSource: "solid-js"`.
- `vite.config.ts`: `@vitejs/plugin-react` → `vite-plugin-solid`; drop the React-only
  `define: {'process.env.NODE_ENV': ...}`. Keep the dual ESM + IIFE lib build (`MandaraxWidget`,
  `mandarax-widget.global.js`), `cssCodeSplit: false`, `styles.css?inline`, sourcemaps.

## Testing

`packages/widget/test/widget.it.test.ts` drives the built IIFE bundle in real Chromium and is
framework-agnostic — it stays as the parity gate (FAB mounts, assistant stream, approval gate,
live vitest card). Cleanup edits must keep it green. No React/Solid import appears in the test.

## Risks / verify during implementation

- Solid `useChat` return shape (accessors vs React's snapshot object) — adapt the render path.
- shiki async highlight inside a Solid component (`createResource` + `<Suspense>` or a signal).
- `gen-ui` dynamic spec→component mapping under Solid.
- IIFE bundle must carry the Solid runtime (no host-page framework assumed), same as React was bundled.

## Out of scope

- Any UI/UX redesign (behavior identical).
- Non-widget packages.
