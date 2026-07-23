# @conciv/embed

## 0.0.16

### Patch Changes

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- [#125](https://github.com/conciv-dev/conciv/pull/125) [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b) Thanks [@omridevk](https://github.com/omridevk)! - Stop the widget from scrolling the host page to the top. TanStack Router installs its scroll handler on every client router even with `scrollRestoration` unset, and `resetScroll` defaults to `true`, so every panel navigation ran `window.scrollTo(0, 0)` on the embedding page, so opening the widget yanked the host site back to the top. The widget router now opts out globally with `scrollRestoration: () => false`, which also covers the `history.back()` paths (Escape-close, quick-terminal close) that a per-navigation `resetScroll` cannot reach. The widget never relied on router scroll restoration: its own scrolling is element-level.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/client@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/mascot@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/storage-history@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.15
  - @conciv/contract@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/mascot@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/storage-history@0.0.15
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
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/storage-history@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- [#84](https://github.com/conciv-dev/conciv/pull/84) [`5db2ac5`](https://github.com/conciv-dev/conciv/commit/5db2ac5a8e7d49f2966cbbaf6718483f5837f759) Thanks [@omridevk](https://github.com/omridevk)! - Corrective release: several 0.0.12 artifacts (embed, extension-terminal, react, preact, solid, and others) were published from an unbuilt workspace and are empty or stale; 0.0.13 republishes every package from a clean CI build.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/client@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/ui-kit-chat-tools@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/mascot@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/storage-history@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.12
  - @conciv/contract@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/mascot@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/storage-history@0.0.12
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
  - @conciv/protocol@0.0.11
  - @conciv/storage-history@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.10
  - @conciv/contract@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/mascot@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/storage-history@0.0.10
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
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/storage-history@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-chat-tools@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/client@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/ui-kit-chat-tools@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/mascot@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/storage-history@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8
