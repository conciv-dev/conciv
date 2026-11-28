# @conciv/vitest-config

## 0.0.24

### Patch Changes

- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/errors@0.0.25

## 0.0.23

### Patch Changes

- [#1179](https://github.com/conciv-dev/conciv/pull/1179) [`edc1e68`](https://github.com/conciv-dev/conciv/commit/edc1e68f1e183342dfc12af844e04cc3f049be21) Thanks [@omridevk](https://github.com/omridevk)! - A plugin package whose vite config lists `UnoCSS()` before `concivTest()` now styles the widget with the app's full utility sheet, instead of the plugin's own on-demand sheet, which missed the kit classes (tool card dots and insets, the copy icon, the user message gap, the one-row composer).

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The app's UnoCSS scan covers only the app, the kits, tools and the core cards; it scans no plugin, and every plugin ships its own sheet. A browser test's generated sheet covers the shell's scan plus the source of the package under test, so a plugin's own suite keeps that plugin's classes.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/browser-fixture` is removed and no longer published. Its one Chromium per test file came from the old tests; browser tests now run in vitest browser mode through `concivTest()` of `@internal/vitest-config`.

## 0.0.22

No changes in this release.

## 0.0.21

No changes in this release.

## 0.0.20

No changes in this release.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14
