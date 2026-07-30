# @conciv/ui-kit-chat-tools

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
