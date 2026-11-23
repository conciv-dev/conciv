# @internal/plugin

Private, never published, inlined into the builds that use it: the opaque definitions conciv's app and its own
plugins share, so the public `@conciv/plugin` SDK exports none of them.

- `src/index.ts`: `OpaqueUi`, made with `createOpaqueType` from `@internal/opaque`. Its public type is the SDK's `Ui`; its internal
  type `InternalUi` adds conciv's own members, with their prop types (`Internal*Props`, `MentionItem`,
  `MentionSegment`, `MentionFieldApi`). The app creates the one `ctx.ui` with `OpaqueUi.createInstance('v1', ...)`;
  conciv's plugins read it with `OpaqueUi.toInternal(ctx.ui)`.
- `src/index.ts`: `OpaqueNoteCard`, the same way: its public type is the
  SDK's `NoteCard`, its internal type is the `note-card` registry token of `InternalNoteCard` (which renders the SDK's public `NoteCardProps`). The
  SDK creates the one `NoteCard` instance; the page and recorder plugins and the app read it with
  `OpaqueNoteCard.toInternal(NoteCard)`.

Invariants: `assertPublicSet` keeps the package private, and `assertPublicTypesPublic`
fails when a public package's built types name it.
