# page/src

## Overview

The DOM side of the page tools, inlined into the widget by `@conciv/embed`. Plain functions the page plugin and the widget call: the React bridge, accessibility snapshots and element refs, element captures with their CSS, dehydrate, the element picker and a toast. It holds no connection to the engine and serves no queries itself.

## Interface

- `index.ts` - the package entry; `reactBridge` is the React bridge as a namespace.
- Subdirectories: [react-grab](./react-grab/README.md).

## Invariants

- `element-descriptor.ts:isSensitiveField` - `type=password` or an `autocomplete` containing `cc-`, `one-time-code`, `current-password` or `new-password` is sensitive; its value reads as `MASKED_VALUE`.
- `select-deep.ts:selectDeep` - matches in the document first, then in the page's open shadow roots, never in the widget's own.
- `render-tracker.ts:installTracker` - installs the commit hook only once.

## Side Effects

- `render-tracker.ts:installTracker` - instruments React through `bippy` `instrument({onCommitFiberRoot})`.
- `effect-toast.ts:showToast` - appends overlay elements to the page.
- `element-capture.ts:loadSnapshotLibrary` - dynamically imports `rrweb-snapshot` and shows an error toast once if it fails.
- `react-grab/adapter.ts` - see [react-grab](./react-grab/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/page` from the repo root (turbo builds the package and its dependencies first)
