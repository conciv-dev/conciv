# @conciv/extension

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Extensions can declare typed, zod-validated browser `pageVerbs` in `.client(...)` and invoke them from `.server(...)` via a scoped, fully-typed `server.page.call(verb, args)`. Every failure path rejects with a typed `PageVerbError` (`no-widget` | `unknown-verb` | `invalid-args` | `handler-error` | `timeout`). Core gains one generic `ext` page-query kind; no framework-specific code.

  Supporting plumbing lands in sibling packages: `@conciv/page` exports the extension page-verb registry (`registerExtensionPageVerbs`/`unregisterExtensionPageVerbs`/`clearExtensionPageVerbs`/`bindExtensionPageVerbs`), the `rootFibers` React-tree walker, and the `dehydrate` serializer (depth/size caps plus secret-key redaction) that every browser verb runs untrusted values through. `@conciv/plugin` exports `makeViteBridge` (from `@conciv/plugin/vite`), a `BundlerBridge` whose `subscribe` emits the generic build/HMR/request-trace diagnostic stream that server-side inspection tools consume.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- [#97](https://github.com/conciv-dev/conciv/pull/97) [`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3) Thanks [@omridevk](https://github.com/omridevk)! - `defineAttachment().card()` now types its component as `Component<AttachmentCardProps>` instead of a bare
  `Component`, so extension authors can read the `remove` element the composer hands the card without
  re-declaring the prop type by hand.
- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/grab@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/grab@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/grab@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.7
  - @conciv/grab@0.0.7
  - @conciv/protocol@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.6
  - @conciv/grab@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/api-client@0.0.5
  - @conciv/grab@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.4
  - @conciv/grab@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.3
  - @conciv/grab@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.2
  - @conciv/grab@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.1
  - @conciv/grab@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/ui-kit-system@0.0.1
