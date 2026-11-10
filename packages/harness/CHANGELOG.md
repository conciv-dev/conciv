# @conciv/harness

## 0.0.22

### Patch Changes

- [#711](https://github.com/conciv-dev/conciv/pull/711) [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9) Thanks [@omridevk](https://github.com/omridevk)! - The Claude model picker now lists the models your Claude account offers, read live from the Agent SDK (the same list as Claude Code's `/model`), instead of a hardcoded list. Core keeps the last list on disk, so the menu shows at once on later starts. The default model is now Opus. Pinned model ids are grouped under "Older versions".

  The model menu moved out of the composer's overflow menu onto the composer prompt: the prompt shows the current model (`opus ❯`) and opens a one-line-per-model menu, with older versions in a nested submenu.

  The model menu ends with an Effort row: pick the reasoning effort the model supports (low, med, high, xhigh, max, or default) per session; the prompt reads `opus 5.5 · high ❯`, and switching to a model without effort clears it.

  The context meter uses the context window Claude reports for each turn (1M for Haiku 5.5, Opus 5.5 and others), instead of guessing 200k, and effort now reaches Claude 5 models (Fable, Opus 5, Sonnet 5, the 5.5 aliases).

- [#730](https://github.com/conciv-dev/conciv/pull/730) [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674) Thanks [@omridevk](https://github.com/omridevk)! - Codex models offer the effort levels Codex lists for them (Low through Max; Codex's own Ultra is left out), and a turn runs Codex at the effort picked for the session.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - Keep every Codex reply. Codex numbers its items from `item_0` again on each turn, so a later reply reused the id of an earlier one: the chat showed it in place of the earlier reply and the saved thread dropped it. Message and tool call ids from Codex are now scoped to their run, and messages read from a Codex transcript carry the session id.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Harness history can list sessions across every project: `HarnessHistory.list` takes a scope (`{cwd}` or `{everywhere: true}`) and every `HarnessSessionMeta` carries the cwd the harness recorded for it.

- [#781](https://github.com/conciv-dev/conciv/pull/781) [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde) Thanks [@omridevk](https://github.com/omridevk)! - Every harness with transcript history now carries a resume command, so "Copy resume command" on a search hit from another project works for Codex, OpenCode and Pi sessions, not only Claude.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

  OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.

  The model menu is searchable: typing in its search field filters every model of every harness by model name, id or harness name (older versions and long lists included), arrows and Enter pick, Escape clears the search and then closes. The effort row leads with Default, checked while the model runs on its own default effort and picked to go back to it. With an empty search each harness shows its main models and says how many more a search reaches. OpenCode lists one row per model (its region routes such as `us.`/`eu.`/`global.` collapse to one) (every model in its catalog, including providers without credentials); a harness with nothing usable says so, and an empty live model list now replaces the saved one instead of being treated as a failure.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#795](https://github.com/conciv-dev/conciv/pull/795) [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6) Thanks [@omridevk](https://github.com/omridevk)! - Arrowing through the session picker no longer piles up previews. A preview waits for the highlight to settle even while one is already open, and an abandoned preview stops reading its transcript instead of folding the whole file before the one you landed on.

- [#796](https://github.com/conciv-dev/conciv/pull/796) [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09) Thanks [@omridevk](https://github.com/omridevk)! - Session previews read a native transcript from its end: `HarnessHistory.tail(cwd, id, {limit, before, signal})` returns one page and an opaque cursor for the page above, so a preview of a 124 MB Claude transcript reads a few hundred KB instead of the whole file. Claude and Codex message ids without a native id are now the byte offset of their opening line (`o<offset>`), so full reads and tails agree; a Codex session imported under the old positional ids re-imports once.

  `HarnessHistory.summary` and `HarnessSessionSummary` are removed (nothing called them), and Codex's `withinProject` reads only the first 64 KiB of a rollout for its `session_meta` cwd instead of the whole file.

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/harness-init@0.0.22

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

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95)]:
  - @conciv/ai@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/harness-init@0.0.21

## 0.0.20

### Patch Changes

- [#566](https://github.com/conciv-dev/conciv/pull/566) [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3) Thanks [@omridevk](https://github.com/omridevk)! - The claude harness now disables the native `AskUserQuestion` tool. It resolves through a host-rendered dialog the CLI only offers over the Agent SDK control channel, which our adapter (a plain `claude -p` spawn) does not have, so the CLI failed closed and answered itself with "The user did not answer the questions" in about 400ms: the widget never showed anything and the agent carried on with an answer nobody gave. Asking now goes through the `conciv_ui` tool's existing `choices` kind, which gains `multiSelect` (the user picks several options, and the answer comes back as a list) and `allowOther` (a free-text row for an answer that is not on the list).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - `claudeExecutable` now throws if the plugin directory path contains whitespace, instead of silently
  producing a broken spawn. `@tanstack/ai-claude-code` builds its argv by splitting the executable
  string on plain spaces with no quoting, so a plugin dir with a space in it would previously mangle
  the `claude` invocation.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#616](https://github.com/conciv-dev/conciv/pull/616) [`00f3200`](https://github.com/conciv-dev/conciv/commit/00f32009789ed532dc6cd6f62b6b360c6e37d0c5) Thanks [@omridevk](https://github.com/omridevk)! - Codex's model list and default model now come from codex's own catalog (`~/.codex/models_cache.json`, listed models in codex's priority order) and config (`model` in `~/.codex/config.toml`), instead of a hardcoded `gpt-5.5` that ChatGPT-account codex rejects. The static `@tanstack/ai-codex` list stays as the fallback when the catalog is missing or unreadable.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
  its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
  protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
  `uninstall()` outside the deleted `claude/attach.ts` and its own test.

  Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
  `@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
  packages already depend on.

  `@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
  (`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
  the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
  dependency.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20
  - @conciv/harness-init@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies []:
  - @conciv/harness-init@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#215](https://github.com/conciv-dev/conciv/pull/215) [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8) Thanks [@omridevk](https://github.com/omridevk)! - Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
  contribution in the new dependency-light `@conciv/harness-init` package, which replaces
  `@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
  contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
  `npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
  detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
  `@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
  `./claude-connect-state` subpaths are gone.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`83272f7`](https://github.com/conciv-dev/conciv/commit/83272f77e201bfb76b958243f90d0ba884de844d), [`d019477`](https://github.com/conciv-dev/conciv/commit/d0194773d25aa4656a20e77f3e63049f351e43e5), [`0f4bb5e`](https://github.com/conciv-dev/conciv/commit/0f4bb5e713f5e09006f43bb951782b2a6ad853a0), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/protocol@0.0.18
  - @conciv/harness-init@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size; each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
