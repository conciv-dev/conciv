# @conciv/mascot-react

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/mascot@0.0.24

## 0.0.23

### Patch Changes

- [#806](https://github.com/conciv-dev/conciv/pull/806) [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839) Thanks [@omridevk](https://github.com/omridevk)! - The React mascot moves out of `@conciv/mascot` into its own `@conciv/mascot-react` package: import
  `Mascot` from `@conciv/mascot-react` instead of `@conciv/mascot/react`. `@conciv/mascot` drops the
  `./react` subpath and its optional `react`/`react-dom` peers, and gains `./adapter`, the core helpers
  a framework wrapper builds on.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#843](https://github.com/conciv-dev/conciv/pull/843) [`1e9abca`](https://github.com/conciv-dev/conciv/commit/1e9abca9874b798e8ba59df5e1e02392b90a6865) Thanks [@omridevk](https://github.com/omridevk)! - The packed install tests (pack the package, install the tarball like an npm user) run only in the Packed CI workflow, through a `test:packed` script; `pnpm test` never packs. npm publish now waits on that workflow.
- Updated dependencies [[`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a), [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`1e9abca`](https://github.com/conciv-dev/conciv/commit/1e9abca9874b798e8ba59df5e1e02392b90a6865)]:
  - @conciv/mascot@0.0.23
