# @conciv/solid-diffs

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.

## 0.0.24

No changes in this release.

## 0.0.23

### Patch Changes

- [`9172bfa`](https://github.com/conciv-dev/conciv/commit/9172bfabc9249dcdc13525a89d778ee02ee7c895) Thanks [@omridevk](https://github.com/omridevk)! - `SolidCodeBlock` unwraps a file held in a Solid store before handing it to the highlight worker, so a store-held file is highlighted instead of failing with `DataCloneError` and rendering as plain text.

- [#1022](https://github.com/conciv-dev/conciv/pull/1022) [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9) Thanks [@omridevk](https://github.com/omridevk)! - Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

  A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

  A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.

## 0.0.22

No changes in this release.

## 0.0.21

No changes in this release.

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Highlight tool-result code and diffs in a worker pool instead of on the main thread. `SolidCodeBlock`, `SolidFileDiff` and `SolidPatchDiff` now hand `@pierre/diffs` a shared worker pool built from its portable worker entry, so that grammar compilation and tokenization run off the main thread while the block keeps rendering plain text until the highlighted result arrives.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Prime the diffs highlight worker pool when the thread mounts. Until the pool finished
  initialising, `File` had no plain-text AST to paint, so the first code surface of a run
  appeared empty and then jumped to its real height, shifting every trace row below it.

- [#558](https://github.com/conciv-dev/conciv/pull/558) [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec) Thanks [@omridevk](https://github.com/omridevk)! - Pins `@pierre/diffs` to the exact `1.2.11` release (its `^1.2.11` range let consumers resolve `1.3.5`, which pulls the unattested `@pierre/theme@2.0.0`) and adds a direct `cytoscape@3.34.0` pin in the whiteboard extension so mermaid's own `^3.33.3` range dedupes to the attested release instead of `3.34.1`. Fixes a fresh `pnpm add -D @conciv/it` failing with `ERR_PNPM_TRUST_DOWNGRADE` under pnpm's `trustPolicy: no-downgrade` ([#520](https://github.com/conciv-dev/conciv/issues/520)).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Pace streamed diff renders. A file whose contents keep growing during a stream now re-tokenises at most once every 100ms instead of on every chunk, and the trailing edge always renders the final content so the settled diff is byte-for-byte what it was before.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Share one Solid library build config across the three Solid libraries, and externalize `@tanstack/solid-pacer` from `@conciv/solid-diffs` so a host that already loads the pacer runtime does not get a second copy inside the diff bundle.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade `@pierre/diffs` to 1.5.2. 1.5 no longer falls back to the file name as the worker
  diff-cache key, so two diffs of the same file name no longer share a cache entry and crash
  with "deletionLine and additionLine are null". The upstream `applyHighlightResult` guard now
  drops highlight results for a superseded file, so our local 1.3.6 patch is gone.
  `FileOptions` / `FileDiffOptions` take a second `Caret` type argument.

  1.5.2 pins `@pierre/theme@2.0.0`, which is published without npm provenance. Consumers that
  install with pnpm `trustPolicy: no-downgrade` must add `@pierre/theme` to `trustPolicyExclude`
  until it ships with provenance again.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
