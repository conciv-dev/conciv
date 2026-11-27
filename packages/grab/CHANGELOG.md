# @conciv/grab

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/frontend-plugin-api@0.0.24

## 0.0.23

### Patch Changes

- [#1153](https://github.com/conciv-dev/conciv/pull/1153) [`8ba04d3`](https://github.com/conciv-dev/conciv/commit/8ba04d3c02c5c34680508f2ff6fdbf8227049e4f) Thanks [@omridevk](https://github.com/omridevk)! - A grabbed element is now a composer note, as every other note: the composer's grab button runs the first registered `GrabPicker`, and the page plugin's picker picks the element, saves the grab on the engine and attaches a note (origin `page`, `href: page-grab:<id>`) that its own note card draws with the element's picture, in the composer and in the sent message, also after a reload. The grab's picture is now drawn with snapdom, as `page_screenshot` draws, so it is a real image. The model reads the note's sentence (`The user referenced the grabbed <Component> element <snippet> at <file>:<line>:<column>.`) and, as an image part of the same message, the picture. The terminal keeps its own picked grabs: each shows in the terminal toolbar as a chip with a remove button, and Enter pastes them into the CLI and empties the list; the panel view no longer draws a strip of staged grabs.

  Public surface: the `GrabApi` contract (`@conciv/frontend-plugin-api/grab`) is deleted. A plugin that wants the user to pick an element calls the `Page` contract's `pick()`, which now resolves the whole `Grab` (text, snippet, source, rect, preview, frames) and attaches nothing; the terminal, the whiteboard's Comment pill and plugins use it. `NoteCard` in `@conciv/frontend-plugin-api` is now an opaque token: its public type shows nothing usable, and only conciv's own plugins draw note cards; a third-party note shows the host chip. `@conciv/grab` drops its `./grab-attachment` entry (`GRAB_MIME`, `grabToFile`, `grabToPayload`, `parseGrabPayload`, `imagePreviewBudget`, `MAX_PAYLOAD_BYTES`) and its `GrabApi` type (`GrabActions` is the picker shape); the engine no longer expands grab attachments, and the chat turn has no attachment expanders. `@conciv/plugin-page/client` no longer exports `pageAttachmentCards` or `fitImagePreview`.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/backend-plugin-api` gains two browser subpaths: `@conciv/frontend-plugin-api/page` declares the `Page` contract (`symbolicate`, `toast`, `capture` with `exclude` and `plugins`, a list of snapdom plugins typed by `@zumer/snapdom`'s own `SnapdomPlugin`, so `@conciv/backend-plugin-api` now depends on `@zumer/snapdom`), the `ReactTree` contract (`rootFibers`, `dehydrate`, `describe`, `locate`, `frames`) and the `PageEffect` registry; `@conciv/frontend-plugin-api/grab` declares the `GrabApi` contract (`pick`, `comment`, `grabbable`, `stage`, `staged`, `clear`) and the `GrabPicker` registry. A plugin's browser bundle may require both. The element grab types (`ElementSource`, `ElementRect`, `Grab`, `GrabPreview`, `DomPreview`, `ImagePreview`, `GrabFrame`) now live in `@conciv/frontend-plugin-api/grab` and `@conciv/grab` re-exports them; `DehydrateOptions` lives in `@conciv/frontend-plugin-api/page` and `@conciv/page` re-exports it.
- Updated dependencies [[`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`35e9999`](https://github.com/conciv-dev/conciv/commit/35e9999ccf358fae142e6d521e0f795ad10862b4)]:
  - @conciv/frontend-plugin-api@0.0.23

## 0.0.22

No changes in this release.

## 0.0.21

No changes in this release.

## 0.0.20

No changes in this release.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

### Patch Changes

- [#143](https://github.com/conciv-dev/conciv/pull/143) [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e) Thanks [@omridevk](https://github.com/omridevk)! - Make the grab contract host-neutral: replace `StagedGrab.snapshot: ElementSnapshot` with `preview: GrabPreview`, a `dom | image` discriminated union so non-web hosts can emit a grab without a live `HTMLElement`, and add optional `GrabApi.grabbable`.

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
