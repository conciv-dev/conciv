# @conciv/solid-diffs

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
