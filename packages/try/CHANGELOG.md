# @conciv/try

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

- [#1214](https://github.com/conciv-dev/conciv/pull/1214) [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a) Thanks [@omridevk](https://github.com/omridevk)! - Works on Node 22 and later (22.16 or newer, the first 22.x with the `node:sqlite` APIs the engine uses). Node code builds for node22, and `Promise.try` and `URL.parse`, which Node 22 lacks or added late, are not used.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/backend@0.0.25
  - @conciv/errors@0.0.25
  - @conciv/harness@0.0.25
  - @conciv/types@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/backend@0.0.24
  - @conciv/harness@0.0.24
  - @conciv/types@0.0.24

## 0.0.23

### Patch Changes

- [#982](https://github.com/conciv-dev/conciv/pull/982) [`ea2713e`](https://github.com/conciv-dev/conciv/commit/ea2713e17729e3af8ba96313f0413c7043484870) Thanks [@omridevk](https://github.com/omridevk)! - A `harness` option or `CONCIV_HARNESS` value that no registered harness has now stops the engine from starting, with `conciv: unknown harness "<id>". Known harnesses: claude, codex, gemini-cli, opencode, pi.`, before any port is bound. Before, the engine started on claude without a word, so a typo in the harness name went unnoticed. `conciv-try --harness` names the same registered harnesses instead of a fixed list. With no harness given, claude is still the default.

- [#1135](https://github.com/conciv-dev/conciv/pull/1135) [`8913a30`](https://github.com/conciv-dev/conciv/commit/8913a30cd463113c644268180d7ecc4edbdf416b) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes a `log` option (`{emit}`, as opencode's SDK): `start` and `makeApp` hand every Effect log of the engine and its plugins to `emit`, beside the log file in the conciv home and the OTLP exporter. The minimum level stays `CONCIV_LOG_LEVEL`. The engine logs a start line once its plugins are supervised.

  The engine no longer writes to the console: every line it used to print (errors, the browser login code, the "port in use" notice) is an Effect log with its values as annotations, and the `print` option is gone. The Vite plugin, the other unplugin hosts and `@conciv/try` show the login code banner, and warnings and errors as their message plus the error; other entries, such as the plugin host's file watcher lines and the start line, stay in the log file.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#840](https://github.com/conciv-dev/conciv/pull/840) [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3) Thanks [@omridevk](https://github.com/omridevk)! - The Vite plugin stamps JSX with TanStack devtools' own source injector (`addSourceToJsx` from `@tanstack/devtools-bundler-core`) instead of a conciv copy, and every reader (element grab, page tools, highlight, design extension) reads `data-tsd-source`. The conciv-named source attribute is gone. A host that also runs `@tanstack/devtools-vite` gets one attribute per element, since the injector skips elements that already carry one.

- [#1061](https://github.com/conciv-dev/conciv/pull/1061) [`aa03dba`](https://github.com/conciv-dev/conciv/commit/aa03dba9033d935292509f863ae20775d4fc6cb4) Thanks [@omridevk](https://github.com/omridevk)! - The try CLI uses the session terminal built into core.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - conciv try sets up its workspace without blocking file calls.
- Updated dependencies [[`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079), [`315e107`](https://github.com/conciv-dev/conciv/commit/315e107f5f4227220039a43523f0c0b72e240724), [`cd5a223`](https://github.com/conciv-dev/conciv/commit/cd5a223235a4fb68a83b7866f241eec7cc143d8f), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`66d8783`](https://github.com/conciv-dev/conciv/commit/66d8783229541cd71e1991732b60bdbee4040143), [`eeb8cb8`](https://github.com/conciv-dev/conciv/commit/eeb8cb8e2713a8f6143593adbf03ac0cc7eab9a8), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`90e849a`](https://github.com/conciv-dev/conciv/commit/90e849ae6b799ed97a0e46e6f2a0be472ecae42a), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4d4a76d`](https://github.com/conciv-dev/conciv/commit/4d4a76d22102ccb2e4d57643386fa89f91e90025), [`f80ae0e`](https://github.com/conciv-dev/conciv/commit/f80ae0ef0ee682829aaf1711d8eb82dfd0b112ac), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eb49d7d`](https://github.com/conciv-dev/conciv/commit/eb49d7d8cbdc756157a270f4b564db346bf4dc39), [`20b7c05`](https://github.com/conciv-dev/conciv/commit/20b7c05ecc0a1d1d4778fdf3ace6494f0433a5e4), [`2a8657b`](https://github.com/conciv-dev/conciv/commit/2a8657b60f990eaa5ffdf4961b48a49dc2a85da3), [`265f2e2`](https://github.com/conciv-dev/conciv/commit/265f2e2341a36d81ac291d0bab2cd6a4f3785e14), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`ea2713e`](https://github.com/conciv-dev/conciv/commit/ea2713e17729e3af8ba96313f0413c7043484870), [`2e92530`](https://github.com/conciv-dev/conciv/commit/2e925301ea3606940101b66bdfc0d6014d74f85f), [`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031), [`85d4a85`](https://github.com/conciv-dev/conciv/commit/85d4a854b9bcdc7c46a0e40a8a7d3bd4b8a6840f), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`57eab25`](https://github.com/conciv-dev/conciv/commit/57eab253e10bd520714bbae304a25bf1b908b135), [`90139c5`](https://github.com/conciv-dev/conciv/commit/90139c52626217d3a313e900d9d372dad4ed190d), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`51708bc`](https://github.com/conciv-dev/conciv/commit/51708bc06ee28f6ff7529ee6a381aa2225e3675c), [`51708bc`](https://github.com/conciv-dev/conciv/commit/51708bc06ee28f6ff7529ee6a381aa2225e3675c), [`d2ea93e`](https://github.com/conciv-dev/conciv/commit/d2ea93eb917965571fe7a4f92fd52b060955ccad), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`78072c4`](https://github.com/conciv-dev/conciv/commit/78072c4bd6187045a2eca50d5511f18f680e5672), [`095ce22`](https://github.com/conciv-dev/conciv/commit/095ce22e610537e7adf1ab3243c9771453af6e3b), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`11afc71`](https://github.com/conciv-dev/conciv/commit/11afc714a6250a51ba77019a4404f82ed07ef496), [`11afc71`](https://github.com/conciv-dev/conciv/commit/11afc714a6250a51ba77019a4404f82ed07ef496), [`492b789`](https://github.com/conciv-dev/conciv/commit/492b78949d199f86daddbb53e17c4d544d3d6dd7), [`6083f45`](https://github.com/conciv-dev/conciv/commit/6083f45c604473e6a43f48bb90895882061d9c7e), [`11f4d64`](https://github.com/conciv-dev/conciv/commit/11f4d64d87bc9324f0e55cd69f542246a19ceafc), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`a16ba7d`](https://github.com/conciv-dev/conciv/commit/a16ba7d2155d177c44658a902a8a3859e62dcef5), [`fb55d51`](https://github.com/conciv-dev/conciv/commit/fb55d51aeb04040b4ba6e6bab7a8a04ae77af73c), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`be0b843`](https://github.com/conciv-dev/conciv/commit/be0b84342d4a34cc41f59669bc881dedac20c0fd), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`8913a30`](https://github.com/conciv-dev/conciv/commit/8913a30cd463113c644268180d7ecc4edbdf416b), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`8c60ea5`](https://github.com/conciv-dev/conciv/commit/8c60ea5a4fea93e5308068bee43bdd432cb933fd), [`2c3306b`](https://github.com/conciv-dev/conciv/commit/2c3306b72cc0e3fa4513505572676611eb885654), [`75ce766`](https://github.com/conciv-dev/conciv/commit/75ce766fc61e019d3a043b0ccd4a45f5c0672085), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`5d160e7`](https://github.com/conciv-dev/conciv/commit/5d160e7841fe6961e0d03938e43ee00cf2e6ca37), [`ebcc567`](https://github.com/conciv-dev/conciv/commit/ebcc5679266560e4e9fc65c46bd1c6e797c617ac), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`0480821`](https://github.com/conciv-dev/conciv/commit/048082189b83fa486d3863216a9cee6121763b77), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`8d8b81c`](https://github.com/conciv-dev/conciv/commit/8d8b81cdfd264b90071e9a6344d61f5427c32e55), [`f71d7f6`](https://github.com/conciv-dev/conciv/commit/f71d7f6fa3964698f7504b27c8b0e008b93fa759), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`3b42bde`](https://github.com/conciv-dev/conciv/commit/3b42bdefc27d56d6bc7368a6b39d00d16e24090f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`a519d5f`](https://github.com/conciv-dev/conciv/commit/a519d5fad8cc0f548c4dcd2a67c671d613dd1184), [`f13572b`](https://github.com/conciv-dev/conciv/commit/f13572bd98d0f51e04cae05daf846e3b9b332924), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`2aaf2e0`](https://github.com/conciv-dev/conciv/commit/2aaf2e0fc45adec0a73f74050b6b4d7ebcf7a580), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`b894936`](https://github.com/conciv-dev/conciv/commit/b894936ae6e8793790c667c694b270e51bd9ef21), [`476a979`](https://github.com/conciv-dev/conciv/commit/476a97995914acb37691ac47f47a3f5cdee648d0), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`89834e4`](https://github.com/conciv-dev/conciv/commit/89834e40b9208aa87bcabe9f36dbf1cea50477ac), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`bd778bd`](https://github.com/conciv-dev/conciv/commit/bd778bd3959881b6a37247c3bf12465d5daf3a07), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`d8be638`](https://github.com/conciv-dev/conciv/commit/d8be638a131ed54979c4a57f2120db9fe33c3e7f), [`b1b9f95`](https://github.com/conciv-dev/conciv/commit/b1b9f9554390b2efc22cef7978656c581a0141a7), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`ef9e8db`](https://github.com/conciv-dev/conciv/commit/ef9e8db736acd149745de30d6063d0e304793f93), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`6a41c2e`](https://github.com/conciv-dev/conciv/commit/6a41c2ee15b6ff333222ad581764e9e9d75a2258), [`9d7ef70`](https://github.com/conciv-dev/conciv/commit/9d7ef700e1f0519e3f5cc5352086c013ed9b8760), [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`02d4e43`](https://github.com/conciv-dev/conciv/commit/02d4e43b8e54caedaba32aa6b9a102ef138d113b), [`4921829`](https://github.com/conciv-dev/conciv/commit/4921829346d609e82f306f3bbd2436d4d5831045), [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145), [`58b6494`](https://github.com/conciv-dev/conciv/commit/58b6494607e8e5f3e5b368eda3de152f88179ca0), [`9896933`](https://github.com/conciv-dev/conciv/commit/98969330d0c53888a0f496c6f81ce39adfee5d16), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5), [`bb68486`](https://github.com/conciv-dev/conciv/commit/bb6848694249e7c684209231bfcb6e9566e20ba6), [`a3c7c5c`](https://github.com/conciv-dev/conciv/commit/a3c7c5c648574cc8bc882906b11fee7fc426e494), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24), [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8ca6099`](https://github.com/conciv-dev/conciv/commit/8ca6099e77a1605ac1767419a977f2d75afdf0e9), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34), [`48d437c`](https://github.com/conciv-dev/conciv/commit/48d437c6e7f5b85b93d29d6765cd0385f441c332), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1d72095`](https://github.com/conciv-dev/conciv/commit/1d7209503bd860554ab27ba92b75a28516f19f33), [`10a7482`](https://github.com/conciv-dev/conciv/commit/10a748242aba6bda1fc19e8e1fb3dc8eded3e5ab), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3), [`8ba27a4`](https://github.com/conciv-dev/conciv/commit/8ba27a4b3f4331445a3a879475d0472385714c89), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`c650fd7`](https://github.com/conciv-dev/conciv/commit/c650fd72a1b6435a9592d17f73556a4668b42cb0), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6a41c2e`](https://github.com/conciv-dev/conciv/commit/6a41c2ee15b6ff333222ad581764e9e9d75a2258), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`74ef725`](https://github.com/conciv-dev/conciv/commit/74ef7258434e2f7b5bf8ac8e4f4c2d1e064cfc7c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`6819ea1`](https://github.com/conciv-dev/conciv/commit/6819ea19a385c85aca783f6318dde282b8e3c031), [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`2a4d780`](https://github.com/conciv-dev/conciv/commit/2a4d7803e39c1c053247251c6de15be56bc7f481), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`6bca3ec`](https://github.com/conciv-dev/conciv/commit/6bca3ecc90ec1e16be822cf759f39e9a7e7d9fce), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4), [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`21ca439`](https://github.com/conciv-dev/conciv/commit/21ca439ec798f2a2598a767c3b878129bc83f5e6), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34)]:
  - @conciv/harness@0.0.23
  - @conciv/backend@0.0.23
  - @conciv/types@0.0.23

## 0.0.22

### Patch Changes

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`b6456c7`](https://github.com/conciv-dev/conciv/commit/b6456c7145b81cb0b6f73f15da4215db74f605ea), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`c4824ef`](https://github.com/conciv-dev/conciv/commit/c4824efb18105452885954ce766e2bea93a266e9), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/core@0.0.22
  - @conciv/harness@0.0.22
  - @conciv/extension-terminal@0.0.22

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - New `@conciv/ai` package: the chat primitives conciv is built from, on top of TanStack AI. Three
  entries, with the message, part and event types living in `@conciv/protocol`:

  - `@conciv/ai/server`: `createChatServer`, which runs every turn through `chat()` with the library's
    persistence (`withPersistence`, streaming snapshots), locks, the local-process sandbox and its
    command policy, code mode with `discover_tools`, WebSocket and SSE delivery with resume, stop and
    hydrate; plus the CLI text adapters (`claudeCode`, `codex`, `opencode`, `acp`, `makeTextAdapter`).
    The patched `@tanstack/ai-sandbox` and `@tanstack/ai-code-mode` ship inside its dist.
  - `@conciv/ai/client`: `createChat` and `createChatSession`, the Solid chat session on the library's
    `useChat` (connection, hydration, stop, approvals). The widget's chat runs on it.
  - `@conciv/ai/testkit`: the story connection and chunk builders for stories and tests.

  `bippy` stays held at its current version.

  New `@conciv/chat` package: the conciv chat plane on top of `@conciv/ai/server` (`createChatPlane`):
  the Drizzle chat stores over `@conciv/db`'s tables, transcript import, compaction with a divider that
  keeps the history, boot recovery, approvals as the library's deny-and-retry flow with once and
  session grants, `conciv_ui` questions, and the code-mode capabilities with the result cap. Tools that
  need approval stay ordinary tool calls outside code mode. Core wires the plane and keeps sessions,
  slash commands and the session bus; `@conciv/core`, `@conciv/db`, `@conciv/harness` and
  `@conciv/protocol` no longer depend on `@tanstack/ai*`.

  The widget posts "Approved: <title>" after an approval and refreshes hydration on stop and on a run
  error. Approval tools called over RPC from outside the widget (the `conciv` CLI, curl) are refused
  with the same ask, and a retry after approving runs.

  The agent prompts and the `react-introspection` skill name `discover_tools`; `external_catalog` is
  gone. `@conciv/harness-testkit` builds on the `@conciv/ai` event types and chunk builders and reaches
  tools through `/api/mcp` with `discover_tools`. `discover_tools` carries each tool's
  output shape and declared error codes.

- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c06f93f`](https://github.com/conciv-dev/conciv/commit/c06f93f3978414d74829f203c898d258ccde1a1f), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3)]:
  - @conciv/core@0.0.21
  - @conciv/harness@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/extension-terminal@0.0.21

## 0.0.20

### Patch Changes

- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`005ce1c`](https://github.com/conciv-dev/conciv/commit/005ce1c0cb34b5b0ce662d9497272144e8a6d10c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`00f3200`](https://github.com/conciv-dev/conciv/commit/00f32009789ed532dc6cd6f62b6b360c6e37d0c5), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/core@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/harness@0.0.20
  - @conciv/extension-terminal@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9), [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41)]:
  - @conciv/core@0.0.19
  - @conciv/extension-terminal@0.0.19
  - @conciv/harness@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/core@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/harness@0.0.18
  - @conciv/extension-terminal@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-terminal@0.0.17
  - @conciv/core@0.0.17
  - @conciv/harness@0.0.17
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension-terminal@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/core@0.0.16
  - @conciv/harness@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies [[`7b075ac`](https://github.com/conciv-dev/conciv/commit/7b075aca0d634fbfa9893f34a1366c2a1af9e20d)]:
  - @conciv/extension-terminal@0.0.15
  - @conciv/core@0.0.15
  - @conciv/harness@0.0.15
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/core@0.0.14
  - @conciv/extension-terminal@0.0.14
  - @conciv/harness@0.0.14
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/core@0.0.13
  - @conciv/harness@0.0.13
  - @conciv/extension-terminal@0.0.13

## 0.0.12

### Patch Changes

- [#77](https://github.com/conciv-dev/conciv/pull/77) [`42af218`](https://github.com/conciv-dev/conciv/commit/42af218d740ecd54d56d76f72155e2e3e1a18fca) Thanks [@omridevk](https://github.com/omridevk)! - Widget-native connect flow: connect-gate boot with in-place handoff, human-first pairing steps, markdown /pair docs, and chat send compatible across contract versions.

- [#77](https://github.com/conciv-dev/conciv/pull/77) [`42af218`](https://github.com/conciv-dev/conciv/commit/42af218d740ecd54d56d76f72155e2e3e1a18fca) Thanks [@omridevk](https://github.com/omridevk)! - Polished connect flow: clack-styled CLI output with browser-pair feedback (new core `onClientRequest` hook), plain greppable lines for agent-driven runs, and a guided-steps waiting panel on conciv.dev.

- Updated dependencies [[`450fc46`](https://github.com/conciv-dev/conciv/commit/450fc463b7bce804ac1c75e3c6a398d1b9f9491e)]:
  - @conciv/core@0.0.12
  - @conciv/extension-terminal@0.0.12
  - @conciv/harness@0.0.12
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-terminal@0.0.11
  - @conciv/core@0.0.11
  - @conciv/harness@0.0.11
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- [#69](https://github.com/conciv-dev/conciv/pull/69) [`a6a5e27`](https://github.com/conciv-dev/conciv/commit/a6a5e27e94e274a6bb711535996fb2b896bae08a) Thanks [@omridevk](https://github.com/omridevk)! - `npx @conciv/try --token <token>`: try conciv live on conciv.dev with the agent CLI already on your machine (token-gated, loopback-only core, CORS-locked to conciv.dev).

- Updated dependencies []:
  - @conciv/core@0.0.10
  - @conciv/extension-terminal@0.0.10
  - @conciv/harness@0.0.10
  - @conciv/protocol@0.0.10
