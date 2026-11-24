# @internal/plugin

Private, never published, inlined into the builds that use it: the opaque definitions conciv's app and its own
plugins share, so the public `@conciv/plugin` SDK exports none of them.

- `src/index.ts`: `OpaqueUi`, made with `createOpaqueType` from `@internal/opaque`. Its public type is the SDK's `Ui`; its internal
  type `InternalUi` adds conciv's own members, with their prop types (`Internal*Props`, `MentionItem`,
  `MentionSegment`, `MentionFieldApi`). `src/ui.tsx` (`@internal/plugin/ui`) makes the one `ctx.ui` instance,
  `createUi(parts)`, from the kits plus the host's own settings header, section and row and its layer stack, passed in as
  `parts`; the app and the light test kit's fake shell call it, and conciv's plugins read it with
  `OpaqueUi.toInternal(ctx.ui)`. It is a separate entry so that a plugin bundle that inlines `OpaqueUi` pulls in no kit.
- `src/index.ts`: `OpaqueNoteCard`, the same way: its public type is the
  SDK's `NoteCard`, its internal type is the `note-card` registry token of `InternalNoteCard` (which renders the SDK's public `NoteCardProps`). The
  SDK creates the one `NoteCard` instance with its own private definition of the same type and version; the page and recorder plugins and the app read it with
  `OpaqueNoteCard.toInternal(NoteCard)`.

Invariants: `assertPublicSet` keeps the package private, and `assertPublicTypesPublic`
fails when a public package's built types name it.
