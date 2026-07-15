# Plan 026: Shiki grammars and themes code-split out of the initial chat bundle, loaded with the highlighter

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/ui-kit-chat/src/styled/markdown.tsx`
> If it changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

The chat markdown renderer statically imports nine Shiki language grammars and two themes at module top-level. Shiki TextMate grammars are large JSON blobs, so they add a substantial fixed cost to the eagerly-loaded chat bundle — paid on every widget boot, before any code block is ever rendered. The highlighter is already _instantiated_ lazily (behind `ensureHighlighter`), but the grammar/theme **modules** are in the static import graph, so they ship regardless. Moving those imports into the async `ensureHighlighter` boundary code-splits them out of the initial bundle; they load on first code-block render, with the existing plaintext fallback covering the gap. Low risk because highlighting is already async with a graceful fallback.

## Current state

- `packages/ui-kit-chat/src/styled/markdown.tsx:1-42` — the static grammar/theme imports and the lazy instantiation:

```ts
import {createSignal, onCleanup, type JSX} from 'solid-js'
import {createHighlighterCore, type HighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import ts from 'shiki/langs/typescript.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import js from 'shiki/langs/javascript.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import json from 'shiki/langs/json.mjs'
import cssLang from 'shiki/langs/css.mjs'
import html from 'shiki/langs/html.mjs'
import bash from 'shiki/langs/bash.mjs'
import md from 'shiki/langs/markdown.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'
import {Streamdown} from '@conciv/solid-streamdown'

// ...

function ensureHighlighter(): void {
  if (store.started) return
  store.started = true
  void createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [ts, tsx, js, jsx, json, cssLang, html, bash, md],
    engine: createJavaScriptRegexEngine(),
  }).then((highlighter) => {
    store.highlighter = highlighter
    store.listeners.forEach((listener) => listener())
  })
}
```

The grammars/themes (`ts`…`md`, `githubLight/Dark`) are used **only** inside `ensureHighlighter`. Moving their imports inside that async function defers the whole payload.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`. oxfmt style.
- `createHighlighterCore` accepts `langs`/`themes` as either loaded objects or async loaders (`() => import(...)`); Shiki supports passing dynamic-import thunks directly.
- Widget change → rebuild + hard reload to observe: `pnpm turbo run build --filter=@conciv/ui-kit-chat` (and the embed bundle for the full split).

## Commands you will need

| Purpose                   | Command                                                      | Expected on success    |
| ------------------------- | ------------------------------------------------------------ | ---------------------- |
| Typecheck                 | `pnpm exec turbo run typecheck --filter=@conciv/ui-kit-chat` | exit 0                 |
| Test                      | `pnpm exec turbo run test --filter=@conciv/ui-kit-chat`      | all pass               |
| Build embed (chunk check) | `pnpm exec turbo run build --filter=@conciv/embed`           | exit 0                 |
| Lint                      | `pnpm exec turbo run lint --filter=@conciv/ui-kit-chat`      | exit 0                 |
| Fallow                    | `pnpm exec fallow audit --changed-since main --format json`  | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/ui-kit-chat/src/styled/markdown.tsx` (move grammar/theme imports into `ensureHighlighter`)

**Out of scope**:

- The `Markdown` component API, the `store`/`subscribe`/`codeBlock` logic, the plaintext fallback (`markdown.tsx:48-53`) — keep them; the fallback is what covers the async gap.
- `@conciv/solid-streamdown` internals.
- Adding/removing languages — keep the same nine langs + two themes.

## Git workflow

- Branch: `advisor/026-lazy-shiki-grammars`
- Commit style: `perf(ui-kit-chat): dynamic-import Shiki grammars/themes so they split out of the boot bundle`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace static grammar/theme imports with dynamic loaders

Remove the 11 static `import` lines for `shiki/langs/*` and `shiki/themes/*`. Pass async loader thunks to `createHighlighterCore` instead. Shiki accepts `() => import('shiki/langs/typescript.mjs')` entries directly in `langs`/`themes`. Target:

```ts
void createHighlighterCore({
  themes: [() => import('shiki/themes/github-light.mjs'), () => import('shiki/themes/github-dark.mjs')],
  langs: [
    () => import('shiki/langs/typescript.mjs'),
    () => import('shiki/langs/tsx.mjs'),
    () => import('shiki/langs/javascript.mjs'),
    () => import('shiki/langs/jsx.mjs'),
    () => import('shiki/langs/json.mjs'),
    () => import('shiki/langs/css.mjs'),
    () => import('shiki/langs/html.mjs'),
    () => import('shiki/langs/bash.mjs'),
    () => import('shiki/langs/markdown.mjs'),
  ],
  engine: createJavaScriptRegexEngine(),
}).then((highlighter) => {
  store.highlighter = highlighter
  store.listeners.forEach((listener) => listener())
})
```

Keep `createHighlighterCore` and `createJavaScriptRegexEngine` as static top-level imports (the core is small and needed to start the async load).

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/ui-kit-chat` → exit 0.

### Step 2: Confirm the split and that highlighting still works

Build and confirm the grammar JSON no longer lives in the boot/entry chunk:

```
pnpm exec turbo run build --filter=@conciv/embed
```

Then in a live dev app (if available), render a message with a fenced code block: it first shows unhighlighted (`<pre><code>` fallback), then repaints highlighted once the async highlighter resolves — matching the existing behavior, just with the grammars now arriving in a separate chunk.

**Verify**: `grep -rl "typescript.tmLanguage\|shiki" packages/embed/dist` shows the grammars in an async chunk, not the main entry; a code block still renders highlighted after the async load.

### Step 3: Test + lint + fallow

The existing `ui-kit-chat` markdown tests (if any) should still pass — highlighting was already async, so behavior is unchanged. If a test asserts synchronous highlight output, make it await the highlighter (`findBy`/poll) rather than removing it.

**Verify**:

- `pnpm exec turbo run test lint --filter=@conciv/ui-kit-chat` → all pass, exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- No new required unit test (behavior unchanged; this is a bundle-composition change). If `ui-kit-chat` has a markdown highlight test, ensure it still passes and awaits the async highlighter.
- Primary verification: the embed build shows grammars in an async chunk (Step 2), and a code block still highlights.

## Done criteria

ALL must hold:

- [ ] `grep -n "shiki/langs/\|shiki/themes/" packages/ui-kit-chat/src/styled/markdown.tsx` shows only dynamic `import(...)` thunks, no static top-level `import x from 'shiki/langs/...'`
- [ ] `pnpm exec turbo run typecheck test lint --filter=@conciv/ui-kit-chat` exits 0
- [ ] `pnpm exec turbo run build --filter=@conciv/embed` places Shiki grammars in an async chunk (verified in dist)
- [ ] A code block still renders highlighted after the async load (functional check or passing test)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `markdown.tsx` doesn't match the "Current state" excerpt (drift).
- The installed Shiki version rejects async loader thunks in `langs`/`themes` (older API) — if `createHighlighterCore` type-errors on the thunks, wrap them differently per that version's API (e.g. `loadLanguage`/`loadTheme` after creation) and report the version; do not revert to static imports.
- After the change, code blocks never highlight (the async load fails silently) — report; the fallback must not become permanent.

## Maintenance notes

- Adding a new language later means adding one more `() => import('shiki/langs/<lang>.mjs')` thunk — it stays in the async chunk automatically.
- A reviewer should confirm the boot chunk shrank and that the first-code-block render still repaints to highlighted (the fallback-then-highlight flow is intended, not a regression).
- Related deferred perf item: `solid-streamdown` re-lexes the full markdown per chunk (PERF-05) — separate plan; this one only addresses the grammar payload, not the per-chunk lex cost.
