# conciv

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
