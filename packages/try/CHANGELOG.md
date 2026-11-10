# @conciv/try

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
