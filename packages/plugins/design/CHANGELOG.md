# @conciv/plugin-design

## 0.0.25

### Patch Changes

- [#1216](https://github.com/conciv-dev/conciv/pull/1216) [`3f786ed`](https://github.com/conciv-dev/conciv/commit/3f786ed0a78a396ec2482b55036611e7f89ce805) Thanks [@omridevk](https://github.com/omridevk)! - New package `@conciv/plugin-design`, the conciv design plugin: the engine loads it and reads its options (the design check's settings). In dev it keys every JSX host element the dev server serves with `data-conciv-key` and every component call imported from outside `solid-js`, `react` and `react-dom` with `data-conciv-site`; the keys are never written into the files, and an element keeps its key while its file is edited. Its browser part is empty for now. `@conciv/cli` takes `diff` from the workspace catalog.

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`e046362`](https://github.com/conciv-dev/conciv/commit/e0463621717628e5f4503fdae008e47ccfb3c24a), [`4f0631d`](https://github.com/conciv-dev/conciv/commit/4f0631dfbb3fa1ba5a87827b08aad4ce18a77f26), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/backend-plugin-api@0.0.25
  - @conciv/frontend-plugin-api@0.0.25
