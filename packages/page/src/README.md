# page/src

## Overview

The DOM side of the page plane. `startPagePlane` reads page queries from the engine and answers them with a page driver that dispatches to client tools, keeps element refs and a console buffer, and returns captures. Also exports the React bridge, snapshot, dehydrate and toast helpers.

## Interface

- `index.ts:startPagePlane({source, driver?, tools?})` - serves page queries until `dispose()`.
- `index.ts:servePageQueries` - for each query that parses with `PageQuerySchema`, runs `driver.execute` and replies with `{requestId, outcome}`; `PageQuerySource` type.
- `page-driver.ts:makeDomPageDriver({tools?, effects?, refs?})` - `PageDriver` with `execute(query, signal?)` (a queued action stops once `signal` aborts), `refs`, `dispose()`.
- `page-tool-dispatcher.ts:makePageToolDispatcher` - dispatches a query to the client tool with the same `name`; `PageToolAnswer`, `PageToolDispatch`.
- `page-snapshot.ts:buildSnapshot` / `addRef` / `describeElement` / `readRole` / `readAccessibleName` / `DOM_CAP` (20000) - accessibility-style snapshots and refs.
- `select-deep.ts:selectDeep(selector)` - the elements a selector matches in the document, followed by those it matches in the page's open shadow roots (never the widget's own; `pageShadowRoot` in the same module decides which shadow roots count, and `isOurs` tells whether an element belongs to the widget).
- `element-descriptor.ts:isSensitiveField` / `MASKED_VALUE` (`***`) / `elementDescriptor`.
- `react-bridge.ts:installReactBridge` / `locate` / `describe` / `inspect` / `override` / `tree` / `find` / `rootFibers` / `elementByName` - React fiber inspection; also exported as the `reactBridge` namespace.
- `render-tracker.ts:startTracking` / `stopTracking` / `report` (exported as `trackReport`) - React commit counting.
- `dehydrate.ts:dehydrate` / `navigatePath` - JSON-safe copies of values.
- `grab-api.ts:grabApi` - `pick`, `comment`, `cancel`, `isActive`.
- `grab-fit.ts:fitImagePreview` - shrinks an image preview under a byte limit.
- `effect-toast.ts:showToast(msg, tone)` - a temporary toast overlay.
- `element-capture.ts:takeElementCapture` / `loadSnapshotLibrary`; `css-bundle.ts:collectPendingCss` / `toCssBundle` - element captures with their CSS.
- `page-failure.ts:fail` / `badArgs` / `unknownVerb` / `failRaised` - typed page errors.
- Subdirectories: [react-grab](./react-grab/README.md).

## Invariants

- `index.ts:servePageQueries` - queries that fail `PageQuerySchema` are skipped; reply failures are swallowed.
- `page-driver.ts:execute` - never throws; errors become `{ok: false, error}`.
- `page-tool-dispatcher.ts` - an unknown tool name fails with `unknownVerb`; a locator with no `ref`, `selector` or `name` fails with `badArgs('no target: pass ref, selector, or name')`.
- `console-buffer.ts:startConsoleBuffer` - console calls are recorded at their own level; an uncaught error is recorded as `uncaught` and an unhandled rejection as `unhandled`, each with its message and its stack when it is an `Error` (the message is kept separately when the stack does not begin with it, as in Firefox and Safari).
- `element-descriptor.ts:isSensitiveField` - `type=password` or an `autocomplete` containing `cc-`, `one-time-code`, `current-password` or `new-password` is sensitive.
- `console-buffer.ts:startConsoleBuffer` - keeps the last 200 entries (`CONSOLE_CAP`).
- `render-tracker.ts:installTracker` - installs the commit hook only once.

## Side Effects

- `console-buffer.ts:startConsoleBuffer` - replaces `console.log/info/warn/error` and adds `error` and `unhandledrejection` listeners on `window`; `dispose` restores them.
- `page-driver.ts:dispose` - turns off enabled client effects and restores the console.
- `render-tracker.ts:installTracker` - instruments React through `bippy` `instrument({onCommitFiberRoot})`.
- `effect-toast.ts:showToast` - appends overlay elements to the page.
- `element-capture.ts:loadSnapshotLibrary` - dynamically imports `rrweb-snapshot` and shows an error toast once if it fails.
- `conciv-global.ts` - declares `window.__CONCIV__`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/page` from the repo root (turbo builds the package and its dependencies first)
