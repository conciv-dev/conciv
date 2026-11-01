# conciv

## 0.0.21

### Patch Changes

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c06f93f`](https://github.com/conciv-dev/conciv/commit/c06f93f3978414d74829f203c898d258ccde1a1f), [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`6bf7fd7`](https://github.com/conciv-dev/conciv/commit/6bf7fd764de4d02b9af80ad10760e733b333c478), [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a), [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103), [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/ai@0.0.21
  - @conciv/client@0.0.21
  - @conciv/core@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/solid-streamdown@0.0.21
  - @conciv/ui-kit-chat@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/tools@0.0.21
  - @conciv/mascot@0.0.21
  - @conciv/page@0.0.21
  - @conciv/ui-kit-chat-tools@0.0.21
  - @conciv/ui-kit-tap@0.0.21
  - @conciv/grab@0.0.21
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

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The launcher glows again for a run it did not start. With chat on its own transport a foreign run reaches the pane as a run lifecycle rather than a local stream, so the mascot read a signal that only its own turns could raise. The pane now registers the session's activity - its own stream or a live run on the session - so the launcher follows the targeted session from the start of a run to its settle.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat pane no longer re-suspends the router match when you switch sessions: the harness meta query is created once at app scope and the pane reads a plain derived accessor, so the pane root is never detached and re-inserted (which reset the transcript's scroll position and flashed the loading pane).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - "Refresh the conversation" is now a real operation instead of a silent stream abort. `chatConnection.refresh()` returns a promise that settles only once the reopened subscription has delivered its first chunk, so callers can await a reconnect rather than fire and forget. A pane-level refresh coordinator (`makeRefreshCoordinator`) awaits that reconnect alongside explicit refetches of the session-scoped queries — the session list that feeds usage and cost, the session markers, and the tool captures — and exposes an `isRefreshing` accessor derived from a single phase signal.

  Both entry points go through the coordinator. The panel's session menu row is now a `Popover.CloseTrigger`, so the menu dismisses on click, and the menu trigger swaps its ellipsis for a spinning refresh glyph (reduced-motion honored through the existing `anim-tool-spin` shortcut) with its accessible name changing to "Refreshing the conversation". The pop-out and quick-terminal toolbar buttons spin and disable the same way. The transcript stays on screen throughout — the refresh never re-arms the loading skeleton — and start, success, and failure are announced in the live region.

- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`005ce1c`](https://github.com/conciv-dev/conciv/commit/005ce1c0cb34b5b0ce662d9497272144e8a6d10c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`236f954`](https://github.com/conciv-dev/conciv/commit/236f95472c51dbd04bc9436a8444e417c8a7ff72), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`4538432`](https://github.com/conciv-dev/conciv/commit/45384329144c3d7f66a41bc8296702ff6cd548f5), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313), [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/ui-kit-chat@0.0.20
  - @conciv/client@0.0.20
  - @conciv/core@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/tools@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/ui-kit-chat-tools@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-streamdown@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/page@0.0.20
  - @conciv/mascot@0.0.20
  - @conciv/ui-kit-tap@0.0.20
  - @conciv/grab@0.0.20

## 0.0.19

### Patch Changes

- [#469](https://github.com/conciv-dev/conciv/pull/469) [`8a1ddc9`](https://github.com/conciv-dev/conciv/commit/8a1ddc94555aec8d7070b42073ecdf9e7af29c94) Thanks [@omridevk](https://github.com/omridevk)! - Extension instance disposal is now owned by `createConcivRouter` itself: a `Wrap` component registers `onCleanup` for every extension instance's `dispose()`, riding whatever unmounts the tree that rendered `RouterProvider`. The three `apps/conciv` browser suites that used to pair `disposeConcivRouter` with a manual unmount no longer need to — they were forgettable by construction, and every consumer that forgot leaked extension state.

  `disposeConcivRouter` stays exported as an explicit, idempotent escape hatch for the one case `Wrap` can't cover: a router created but never rendered (e.g. a boot that fails before `render()` runs) still needs an owner for its eagerly-created extension instances. It shares one guarded disposer with `Wrap`'s `onCleanup` — first call disposes, every later call (whether from a normal unmount or a repeat call) is a no-op — so `packages/embed/src/mount-impl.tsx` can keep calling it unconditionally in its disposer list without double-disposing.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249), [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/core@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/ui-kit-chat-tools@0.0.19
  - @conciv/client@0.0.19
  - @conciv/ui-kit-tap@0.0.19
  - @conciv/page@0.0.19
  - @conciv/grab@0.0.19
  - @conciv/mascot@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19
  - @conciv/solid-streamdown@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`3077460`](https://github.com/conciv-dev/conciv/commit/307746013f8dbdc03e1cd98673aaa4e574b81342)]:
  - @conciv/ui-kit-chat@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/page@0.0.18
  - @conciv/ui-kit-chat-tools@0.0.18
  - @conciv/client@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/grab@0.0.18
  - @conciv/mascot@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies [[`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85), [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a)]:
  - @conciv/ui-kit-chat@0.0.17
  - @conciv/ui-kit-chat-tools@0.0.17
  - @conciv/client@0.0.17
  - @conciv/contract@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/grab@0.0.17
  - @conciv/mascot@0.0.17
  - @conciv/page@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/page@0.0.16
  - @conciv/client@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/mascot@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.15
  - @conciv/contract@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/mascot@0.0.15
  - @conciv/page@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/ui-kit-chat@0.0.15
  - @conciv/ui-kit-chat-tools@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3), [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41)]:
  - @conciv/extension@0.0.14
  - @conciv/client@0.0.14
  - @conciv/ui-kit-chat@0.0.14
  - @conciv/ui-kit-chat-tools@0.0.14
  - @conciv/contract@0.0.14
  - @conciv/grab@0.0.14
  - @conciv/mascot@0.0.14
  - @conciv/page@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/client@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/page@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/ui-kit-chat-tools@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/mascot@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.12
  - @conciv/contract@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/mascot@0.0.12
  - @conciv/page@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/ui-kit-chat@0.0.12
  - @conciv/ui-kit-chat-tools@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59)]:
  - @conciv/solid-streamdown@0.0.11
  - @conciv/ui-kit-chat@0.0.11
  - @conciv/ui-kit-chat-tools@0.0.11
  - @conciv/client@0.0.11
  - @conciv/contract@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/grab@0.0.11
  - @conciv/mascot@0.0.11
  - @conciv/page@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.10
  - @conciv/contract@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/mascot@0.0.10
  - @conciv/page@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/ui-kit-chat@0.0.10
  - @conciv/ui-kit-chat-tools@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.9
  - @conciv/contract@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/grab@0.0.9
  - @conciv/mascot@0.0.9
  - @conciv/page@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-chat-tools@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/client@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/page@0.0.8
  - @conciv/ui-kit-chat-tools@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/mascot@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8
