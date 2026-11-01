# page/src/client

## Overview

bodies.ts pairs each shared def with a DOM or React-bridge implementation running in the page, attaches a card renderer, and exports the ordered list `PAGE_CLIENT_TOOLS`. screenshot.ts captures the viewport with snapdom, leaves out the conciv widget, and returns base64 webp. hmr.ts listens to Vite hot events so `page_hmr` can wait for an update to apply. page-result-views.tsx, page-format.ts and body-margins.ts provide display and capture helpers. The per-tool render cards live in cards/.

## Interface

- `PAGE_CLIENT_TOOLS` (`bodies.ts`): readonly `AnyToolBuilder[]` with client bodies for page_route, dom, query, console, text, value, attr, exists, snapshot, screenshot, hmr, locate, tree, inspect, override, find, track, effect, wait, reload, click, fill, select, check, uncheck, press, hover, scroll, submit, setattr, removeattr, addclass, removeclass, setstyle, settext, sethtml, remove, insert, css and eval
- `screenshot()` (`screenshot.ts`): returns `PageScreenshot` `{image (base64 webp), width, height}`
- `watchHotUpdates(hot)` (`hmr.ts`): returns `(timeoutMs) => Promise<HotUpdateWait>`; `HotSurface` type
- `keepBodyMargins` (`body-margins.ts`): `SnapdomPlugin` named `keep-body-margins`
- `formatHtml(src)` (`page-format.ts`): pretty-prints HTML with js-beautify (indent 2, no wrap)
- `A11yNodeList`, `PageHtmlBlock`, `PageValueChip`, `A11yNode` (`page-result-views.tsx`): Solid components for snapshot nodes, an HTML code block and a value chip
- module declaration `js-beautify/js/lib/beautifier.js` (`js-beautify-html.d.ts`): types for the `html` export
- stories `NodeList`, `HtmlBlock`, `ValueChip` (`page-result-views.stories.tsx`): Storybook stories under `Extensions/Page/tool/PageResultViews`
- Subdirectories:
  - [cards](./cards/README.md): Solid.js tool-result cards that render page-extension tool calls (act, read, console, effect, react, edit-live), the grouped page-session card, and the grabbed-element attachment card, plus Storybook stories and fixtures for them.

## Invariants

- `fail` / `badArgs` (`bodies.ts`) throw `pageFailure('handler-error' | 'invalid-args', message)`
- `toggleChecked` (`bodies.ts`) rejects non-input targets and refuses to uncheck a radio
- `page_fill` (`bodies.ts`) rejects non-field targets; `page_select` rejects anything that is not a `<select>`; `page_click` and `page_setstyle` require an `HTMLElement`; `page_submit` requires an owning form
- `page_value` and `page_fill` (`bodies.ts`) return `MASKED_VALUE` when `isSensitiveField(el)` is true
- `page_dom` and `page_text` (`bodies.ts`) truncate output to `DOM_CAP`; `page_query` returns at most 20 element descriptions
- `page_wait` (`bodies.ts`) requires a selector; it defaults to state `visible` and timeout 5000ms, polls every 100ms, and rejects with `wait timed out` after the deadline
- `page_override` (`bodies.ts`) rejects `json` that is not valid JSON and fails when `reactBridge.override` returns an error
- `page_inspect` (`bodies.ts`) fails when the element has no React fiber and rejects a `path` it cannot find; `page_locate` fails when there is no React fiber
- `listEffects` / `requireEffect` (`bodies.ts`): action `list` rejects an effect name; other actions require a name, and an unknown name throws `toolError('UNKNOWN_EFFECT')`
- `page_eval` (`evaluate`, `bodies.ts`) first evaluates the code as an expression and falls back to a statement body only on `SyntaxError`
- `watchHotUpdates` (`hmr.ts`) returns `supported:false` when `import.meta.hot` is undefined; it reports a settle from the last `RECENT_SETTLE_MS` (1000ms) with `waitedMs` 0, and returns an error result if no settle arrives before the timeout
- `formatHtml` (`page-format.ts`) returns the input unchanged if beautify throws
- `screenshot` (`screenshot.ts`) clips to the viewport at dpr 1, removes `[data-conciv-root]` and encodes webp at quality 0.8

## Side Effects

- DOM mutation (`bodies.ts`): page_click, fill, select, check, uncheck, press, hover, scroll, submit, setattr, removeattr, addclass, removeclass, setstyle, settext, sethtml, remove, insert; `page_css` appends `<style data-vibe-css>` to document.head
- `page_reload` (`bodies.ts`) calls `location.reload()` after a `setTimeout(0)`
- `page_eval` (`bodies.ts`) runs arbitrary code through `new Function`
- `page_track` (`bodies.ts`) calls `startTracking` / `stopTracking`, which hold global render-tracking state; `page_snapshot` calls `ctx.resetRefs()`
- `page_effect` (`bodies.ts`) toggles host-registered effects through `effect.set`
- `watchHotUpdates(import.meta.hot)` (`bodies.ts`, `hmr.ts`) registers listeners for `vite:beforeUpdate`, `vite:afterUpdate` and `vite:error` at module load
- `screenshot` (`screenshot.ts`) dynamically imports @zumer/snapdom, clones and rasterizes the document, and uses `FileReader` and `createImageBitmap`
- `keepBodyMargins` (`body-margins.ts`) changes the snapdom clone's styles, not the live DOM

## Verification

- Run: `cd packages/extensions/page && pnpm test`
