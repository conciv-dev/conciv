# @conciv/harness

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size — each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

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
