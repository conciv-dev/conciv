# page/src

## Overview

The DOM side of the page plane. The widget answers each `conciv:page:query` hub call with a page driver that dispatches to client tools, keeps element refs and a console buffer, and returns captures. Also exports the React bridge, snapshot, dehydrate and toast helpers.

## Interface

- `page-driver.ts:makeDomPageDriver({tools?, effects?, refs?})` - `PageDriver` with `execute(query)`, `answer(query)` (parses an untrusted query first), `refs`, `dispose()`.
- `page-tool-dispatcher.ts:makePageToolDispatcher` - dispatches a query to the client tool with the same `name`; `PageToolAnswer`, `PageToolDispatch`.
- `page-snapshot.ts:buildSnapshot` / `addRef` / `describeElement` / `roleOf` / `accessibleNameOf` / `DOM_CAP` (20000) - accessibility-style snapshots and refs.
- `element-descriptor.ts:isSensitiveField` / `MASKED_VALUE` (`***`) / `elementDescriptor`.
- `react-bridge.ts:installReactBridge` / `locate` / `describe` / `inspect` / `override` / `tree` / `find` / `rootFibers` / `elementByName` - React fiber inspection; also exported as the `reactBridge` namespace.
- `render-tracker.ts:startTracking` / `stopTracking` / `report` (exported as `trackReport`) - React commit counting.
- `dehydrate.ts:dehydrate` / `navigatePath` - JSON-safe copies of values.
- `grab-api.ts:grabApi` - `pick`, `comment`, `cancel`, `isActive`.
- `grab-fit.ts:fitImagePreview` - shrinks an image preview under a byte limit.
- `effect-toast.ts:showToast(msg, tone)` - a temporary toast overlay.
- `element-capture.ts:takeElementCapture` / `loadSnapshotLibrary`; `css-bundle.ts:collectPendingCss` / `toCssBundle` - element captures with their CSS.
- `page-mirror.ts:mirrorPageAction` - shows a cursor and pulse ring over an element the agent acted on.
- `page-failure.ts:fail` / `badArgs` / `unknownVerb` / `failRaised` - typed page errors.
- Subdirectories: [react-grab](./react-grab/README.md).

## Invariants

- `page-driver.ts:answer` - a query that fails `PageQuerySchema` answers `{ok: false, error: {code: 'invalid-args'}}`.
- `page-driver.ts:execute` - never throws; errors become `{ok: false, error}`.
- `page-tool-dispatcher.ts` - an unknown tool name fails with `unknownVerb`; a locator with no `ref`, `selector` or `name` fails with `badArgs('no target: pass ref, selector, or name')`.
- `element-descriptor.ts:isSensitiveField` - `type=password` or an `autocomplete` containing `cc-`, `one-time-code`, `current-password` or `new-password` is sensitive.
- `console-buffer.ts:startConsoleBuffer` - keeps the last 200 entries (`CONSOLE_CAP`).
- `render-tracker.ts:installTracker` - installs the commit hook only once.

## Side Effects

- `console-buffer.ts:startConsoleBuffer` - replaces `console.log/info/warn/error` and adds `error` and `unhandledrejection` listeners on `window`; `dispose` restores them.
- `page-driver.ts:dispose` - turns off enabled client effects and restores the console.
- `render-tracker.ts:installTracker` - instruments React through `bippy` `instrument({onCommitFiberRoot})`.
- `effect-toast.ts:showToast` / `page-mirror.ts:mirrorPageAction` - append overlay elements to the page.
- `element-capture.ts:loadSnapshotLibrary` - dynamically imports `rrweb-snapshot` and shows an error toast once if it fails.
- `conciv-global.ts` - declares `window.__CONCIV__`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/page` from the repo root (turbo builds the package and its dependencies first)
