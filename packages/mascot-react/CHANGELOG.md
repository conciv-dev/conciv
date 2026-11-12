# @conciv/mascot-react

## 0.0.23

### Patch Changes

- [#806](https://github.com/conciv-dev/conciv/pull/806) [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839) Thanks [@omridevk](https://github.com/omridevk)! - The React mascot moves out of `@conciv/mascot` into its own `@conciv/mascot-react` package: import
  `Mascot` from `@conciv/mascot-react` instead of `@conciv/mascot/react`. `@conciv/mascot` drops the
  `./react` subpath and its optional `react`/`react-dom` peers, and gains `./adapter`, the core helpers
  a framework wrapper builds on.

- [#843](https://github.com/conciv-dev/conciv/pull/843) [`1e9abca`](https://github.com/conciv-dev/conciv/commit/1e9abca9874b798e8ba59df5e1e02392b90a6865) Thanks [@omridevk](https://github.com/omridevk)! - The packed install tests (pack the package, install the tarball like an npm user) run only in the Packed CI workflow, through a `test:packed` script; `pnpm test` never packs. npm publish now waits on that workflow.
- Updated dependencies [[`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839), [`1e9abca`](https://github.com/conciv-dev/conciv/commit/1e9abca9874b798e8ba59df5e1e02392b90a6865)]:
  - @conciv/mascot@0.0.23
