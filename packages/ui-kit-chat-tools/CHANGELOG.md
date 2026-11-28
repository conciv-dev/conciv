# @conciv/ui-kit-chat-tools

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1210](https://github.com/conciv-dev/conciv/pull/1210) [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243) Thanks [@omridevk](https://github.com/omridevk)! - Every error conciv makes now comes from an evlog error catalog, with a stable code, a plain message and, where
  someone can act on it, a why and a fix. The core catalogs live in one new package, @conciv/errors, so packages
  compare codes without importing each other; each plugin keeps its own catalog, and the app provides @conciv/errors
  to plugins. Plugin.define accepts any Error, so a plugin fails its entry with its own catalog error; a plugin that
  fails to load reports its code, message and fix. Error screens, the run error row, toasts and plugin load errors show
  the fix when the error carries one, and the conciv-try CLI prints a failure as its code and message, then its why and
  fix only when they are set.

  Codes that reach agents and the widget change with it: an outside run without a tab answers `ai.NO_TAB` (was
  `NO_TAB`), a send to a deleted session fails with `session.DELETED` (was `session_deleted`), a code-mode tool error
  reaches the agent as `<code>: message` with its full catalog code, and the widget shows the engine's fix for an rpc
  error. The protocol's `ValueTooLargeError` is gone: an oversized instruction entry fails with
  `instructions.VALUE_TOO_LARGE`.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`8b8bc6f`](https://github.com/conciv-dev/conciv/commit/8b8bc6fd56da74578a3e8316e1c922d5cbf8cc6e), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/errors@0.0.25
  - @conciv/protocol@0.0.25
  - @conciv/solid-diffs@0.0.25
  - @conciv/types@0.0.25
  - @conciv/ui-kit-chat@0.0.25
  - @conciv/ui-kit-system@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-chat@0.0.24
  - @conciv/protocol@0.0.24
  - @conciv/solid-diffs@0.0.24
  - @conciv/types@0.0.24
  - @conciv/ui-kit-system@0.0.24

## 0.0.23

### Patch Changes

- [#999](https://github.com/conciv-dev/conciv/pull/999) [`5724db1`](https://github.com/conciv-dev/conciv/commit/5724db197a3f71c050123dd34a82416031a1ecbb) Thanks [@omridevk](https://github.com/omridevk)! - A style change in a plugin or kit that the widget's stylesheet reads now rebuilds that stylesheet, instead of the build reusing an older copy that lacked the new styles.

- [#935](https://github.com/conciv-dev/conciv/pull/935) [`0b7f78a`](https://github.com/conciv-dev/conciv/commit/0b7f78acc061692acdca35cc2e5462c75a02e2a3) Thanks [@omridevk](https://github.com/omridevk)! - A patch header with no file name after `File:` no longer shows the next line as the file, on the patch card or in the turn summary, and a header followed only by spaces or tabs no longer adds a nameless file to the patch card. Very long tool names no longer freeze the chat while their label is worked out.

- [#1022](https://github.com/conciv-dev/conciv/pull/1022) [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9) Thanks [@omridevk](https://github.com/omridevk)! - Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

  A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

  A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks draw in their card while a reply streams, name their language with a code icon, highlight every shiki language and sit apart from each other; thread rows re-measure after a skin change; a tab opened while its session is deleted is closed; the hub answers tasks.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f) Thanks [@omridevk](https://github.com/omridevk)! - Leftovers of the old extension system are gone: the Combobox `ModelSelector`, the permission expiry chip, the terminal rail and `inject`, the dialog `layer` prop and `DialogApi`, `StagedGrab`, the `./tokens` subpath and the window React bridge global.
- Updated dependencies [[`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c), [`5724db1`](https://github.com/conciv-dev/conciv/commit/5724db197a3f71c050123dd34a82416031a1ecbb), [`9172bfa`](https://github.com/conciv-dev/conciv/commit/9172bfabc9249dcdc13525a89d778ee02ee7c895), [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`21a5651`](https://github.com/conciv-dev/conciv/commit/21a56511c8515b565617f163cd5c336cb462ddff), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`bc6656b`](https://github.com/conciv-dev/conciv/commit/bc6656b7e91418c54f7eee94fa08bcf5ed434d5b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`9d9a594`](https://github.com/conciv-dev/conciv/commit/9d9a59474837ae21a337599aeebd7f9e8486a61b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`3c4c575`](https://github.com/conciv-dev/conciv/commit/3c4c575d23931e2c3714b38fa853d2b9942ddade), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`20b7c05`](https://github.com/conciv-dev/conciv/commit/20b7c05ecc0a1d1d4778fdf3ace6494f0433a5e4), [`04c64fe`](https://github.com/conciv-dev/conciv/commit/04c64fe96e59c8363a72b11ed58f4fa63e2f04cf), [`cde9c35`](https://github.com/conciv-dev/conciv/commit/cde9c350ae4966ae66258f25661a7ad3de485dcd), [`9682389`](https://github.com/conciv-dev/conciv/commit/9682389739ca98d316d202e3a5abd54828a79b43), [`e97f7c2`](https://github.com/conciv-dev/conciv/commit/e97f7c2440c6a3946ca3594c692e566305f4e953), [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`0b7f78a`](https://github.com/conciv-dev/conciv/commit/0b7f78acc061692acdca35cc2e5462c75a02e2a3), [`956c20d`](https://github.com/conciv-dev/conciv/commit/956c20dfcbfed72523bb38f8c8632f06e2c6df59), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`d8c2c1b`](https://github.com/conciv-dev/conciv/commit/d8c2c1b3850be01ab52fa35f998ef247c6bd5671), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`f5f2ac4`](https://github.com/conciv-dev/conciv/commit/f5f2ac4b2e9ca100f61137af484128824ad377ea), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`69c4117`](https://github.com/conciv-dev/conciv/commit/69c4117dff5620c1f9588902f41204a51f03fffb), [`f653740`](https://github.com/conciv-dev/conciv/commit/f653740c66d2679792e6cea44e091013e3cea813), [`a0f5c5e`](https://github.com/conciv-dev/conciv/commit/a0f5c5e24e29d085ad972de89a6cc2eda894cf00), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`e503d38`](https://github.com/conciv-dev/conciv/commit/e503d381e9567fa739fed2b5ff84daadeeb646b3), [`8d57382`](https://github.com/conciv-dev/conciv/commit/8d57382a4365e2031bc484478b5b8950bd45cca9), [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1780a56`](https://github.com/conciv-dev/conciv/commit/1780a5662afcdb273b2ac2d212ba49487f1b1216), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e7ddc30`](https://github.com/conciv-dev/conciv/commit/e7ddc30247704fa779205cbb8aef14505213b981), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e67cfba`](https://github.com/conciv-dev/conciv/commit/e67cfba64e8f66b708b16d3e5c1fd031f4984511), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`bac0cc2`](https://github.com/conciv-dev/conciv/commit/bac0cc25711bd1a985813f860a40ff743ab94f51), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`6794c37`](https://github.com/conciv-dev/conciv/commit/6794c3729dd895e2eba89b52484628962ff9d738), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`0040247`](https://github.com/conciv-dev/conciv/commit/00402478d56e462a750212086ddf5202f7e51316), [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`571d456`](https://github.com/conciv-dev/conciv/commit/571d456cd232387f11dd2e119d1971f409a825c6), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`144a4c5`](https://github.com/conciv-dev/conciv/commit/144a4c53163a9aa1cea68f700bf055b2fe5029b8), [`3904487`](https://github.com/conciv-dev/conciv/commit/390448709c8d3ed47aa2a82772c76e7ede6e70c5), [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`414d5ea`](https://github.com/conciv-dev/conciv/commit/414d5eaeb08da91e21aa142f107c8949fcb475e4), [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`412aed2`](https://github.com/conciv-dev/conciv/commit/412aed2365d7d3729be24cd846cd6f0370bfd425), [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f), [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f), [`83c6c31`](https://github.com/conciv-dev/conciv/commit/83c6c31813526758e86b21984b7d224738920fe7), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`2c69bca`](https://github.com/conciv-dev/conciv/commit/2c69bca8cb40a8c71c13ee780abb9ca31900b328), [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a), [`b0cd4e4`](https://github.com/conciv-dev/conciv/commit/b0cd4e40d59112f024787685f1b0f0c1c74d9524), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`a14cb77`](https://github.com/conciv-dev/conciv/commit/a14cb7704a32edc31189fb344a9bd933949e664e), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`08cfb11`](https://github.com/conciv-dev/conciv/commit/08cfb11d6b7d3f47720e8fe0dd3cd10e0f096a85), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811)]:
  - @conciv/ui-kit-chat@0.0.23
  - @conciv/solid-diffs@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/types@0.0.23
  - @conciv/ui-kit-system@0.0.23

## 0.0.22

### Patch Changes

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Tool rows and their result bodies build a fraction of the reactive work they used to. A copy button inside the thread shares the thread's one tooltip and builds its icon swap on first hover or focus, and the row, card and output layers derive each value once.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4), [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9ea8792`](https://github.com/conciv-dev/conciv/commit/9ea8792e73c9f569e0c7e48b802fe32e597aa877), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`9003236`](https://github.com/conciv-dev/conciv/commit/90032366211b3ab568a5c92335adce4be6e097a7), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/ui-kit-chat@0.0.22
  - @conciv/ui-kit-system@0.0.22
  - @conciv/extension-page@0.0.22
  - @conciv/solid-diffs@0.0.22

## 0.0.21

### Patch Changes

- [#637](https://github.com/conciv-dev/conciv/pull/637) [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f) Thanks [@omridevk](https://github.com/omridevk)! - Test-only: fold each package's tests into one file and drop the empty node vitest project.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a), [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103), [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/ui-kit-chat@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/solid-diffs@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Share one Solid library build config across the three Solid libraries, and externalize `@tanstack/solid-pacer` from `@conciv/solid-diffs` so a host that already loads the pacer runtime does not get a second copy inside the diff bundle.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ee779f0`](https://github.com/conciv-dev/conciv/commit/ee779f0456f0c4aedb5c00d8c2d69229de7598a1), [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313), [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f), [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/ui-kit-chat@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/extension-page@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-diffs@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/extension-page@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`b687236`](https://github.com/conciv-dev/conciv/commit/b687236db6e3793f1ecb909ebafa7bf1ed02ff8f), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`42a0ad0`](https://github.com/conciv-dev/conciv/commit/42a0ad0273cbf8b1b48d197c363f4f77da75dc69), [`32b49c3`](https://github.com/conciv-dev/conciv/commit/32b49c36a2c62210391449a1b2f01095d8ece57f)]:
  - @conciv/tools@0.0.18
  - @conciv/ui-kit-chat@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension-page@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies [[`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85), [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a)]:
  - @conciv/ui-kit-chat@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/tools@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Purpose-built tool cards for the code-mode and discovery surfaces: CodeRunCard (`execute_typescript`), DiscoveredApisCard (`discover_tools`), LoadedToolsCard (`__lazy__tool__discovery__`), and a `conciv_extensions` inline row, so no conciv-owned tool falls through to the generic fallback. `ToolCard` gains an optional `status` override, letting a payload-level failure (`success: false` on a wire-successful call) render the failure state instead of a green dot, and its status dot is now labelled for assistive tech. Code-mode binding names are sanitized to valid JS identifiers, fixing a crash where a single dotted tool name (`canvas.svg`) produced invalid generated source and broke every `execute_typescript` call.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4)]:
  - @conciv/protocol@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/tools@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15
  - @conciv/solid-diffs@0.0.15
  - @conciv/tools@0.0.15
  - @conciv/ui-kit-chat@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41)]:
  - @conciv/ui-kit-chat@0.0.14
  - @conciv/tools@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/solid-diffs@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/tools@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/solid-diffs@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12
  - @conciv/solid-diffs@0.0.12
  - @conciv/tools@0.0.12
  - @conciv/ui-kit-chat@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-chat@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/solid-diffs@0.0.11
  - @conciv/tools@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10
  - @conciv/solid-diffs@0.0.10
  - @conciv/tools@0.0.10
  - @conciv/ui-kit-chat@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9
  - @conciv/solid-diffs@0.0.9
  - @conciv/tools@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/tools@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/solid-diffs@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7
  - @conciv/solid-diffs@0.0.7
  - @conciv/tools@0.0.7
  - @conciv/ui-kit-chat@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6
  - @conciv/solid-diffs@0.0.6
  - @conciv/tools@0.0.6
  - @conciv/ui-kit-chat@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5
  - @conciv/solid-diffs@0.0.5
  - @conciv/tools@0.0.5
  - @conciv/ui-kit-chat@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4
  - @conciv/solid-diffs@0.0.4
  - @conciv/tools@0.0.4
  - @conciv/ui-kit-chat@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3
  - @conciv/solid-diffs@0.0.3
  - @conciv/tools@0.0.3
  - @conciv/ui-kit-chat@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2
  - @conciv/solid-diffs@0.0.2
  - @conciv/tools@0.0.2
  - @conciv/ui-kit-chat@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
  - @conciv/solid-diffs@0.0.1
  - @conciv/tools@0.0.1
  - @conciv/ui-kit-chat@0.0.1
  - @conciv/ui-kit-system@0.0.1
