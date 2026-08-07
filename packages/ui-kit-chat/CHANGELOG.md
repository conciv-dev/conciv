# @conciv/ui-kit-chat

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Fix double-constructed JSX props and tighten composer state handling.

  - `ToolChip`'s `tip` and `Terminal`'s `rail` resolve their JSX prop through a `children()` memo, so a
    component passed as that prop is built once instead of two or three times.
  - The model selector no longer disappears when the model list fails to load: it renders a retry
    affordance, announces the failure, and restores the picker once the retry succeeds.
  - Thread auto-scroll runs off an explicit machine, and reactive-scope listeners and timers go through
    solid-primitives so they clean themselves up with their owner.

- [#175](https://github.com/conciv-dev/conciv/pull/175) [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6) Thanks [@omridevk](https://github.com/omridevk)! - Load shiki grammars and themes lazily so code-splitting consumers don't hoist doubly-reachable modules.

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - ModelSelector no longer drops keystrokes typed right after the trigger is tapped. The combobox open
  state is owned by the machine unless a consumer passes `open`, so the list opens in the same turn as
  the trigger activation instead of after a round trip through Solid.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/storage-history@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- [#153](https://github.com/conciv-dev/conciv/pull/153) [`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85) Thanks [@omridevk](https://github.com/omridevk)! - Let the composer's model picker shrink so Stop and Send stay reachable at phone widths. While a turn is running the composer shows Stop next to Send, and the action row had nothing that could give up space: the icon buttons are fixed size by design, and the model pill sat inside wrappers that were all sized to their full label. The row overflowed, and on a 320px phone the Send button was pushed off screen entirely. The pill now shrinks and truncates its label ("Claude Sonnet 4.5" becomes "Claude S...") so the whole row fits, which also removes the few pixels of overflow at 393px and on any narrower device.

- [#154](https://github.com/conciv-dev/conciv/pull/154) [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a) Thanks [@omridevk](https://github.com/omridevk)! - Touch, wheel, and keyboard scrolling in the thread now detaches auto-follow, so scrolling back through a reply while the assistant is still streaming no longer fights a re-pin that snaps you to the bottom. This was most visible on iOS, where the browser reports scrolling later than the streamed content arrives. Auto-follow resumes as soon as you return to the bottom or press the scroll-to-end button.

- Updated dependencies []:
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- [#94](https://github.com/conciv-dev/conciv/pull/94) [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41) Thanks [@omridevk](https://github.com/omridevk)! - Replace the custom busy-send queue with TanStack AI's native FIFO queue, queued-message controls, and interrupt steering.

- Updated dependencies []:
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59)]:
  - @conciv/solid-streamdown@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7
  - @conciv/solid-streamdown@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6
  - @conciv/solid-diffs@0.0.6
  - @conciv/solid-streamdown@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5
  - @conciv/solid-diffs@0.0.5
  - @conciv/solid-streamdown@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4
  - @conciv/solid-diffs@0.0.4
  - @conciv/solid-streamdown@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3
  - @conciv/solid-diffs@0.0.3
  - @conciv/solid-streamdown@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2
  - @conciv/solid-diffs@0.0.2
  - @conciv/solid-streamdown@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
  - @conciv/solid-diffs@0.0.1
  - @conciv/solid-streamdown@0.0.1
  - @conciv/ui-kit-system@0.0.1
