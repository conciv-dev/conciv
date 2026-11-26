# @internal/frontend-app-api

Private, never published, inlined into the builds that use it: the machinery behind `@conciv/frontend-plugin-api`.
Plugins never import it; the shell (`@internal/frontend-defaults`), the test utilities and conciv's own plugins do.

- `src/plugin`: the plugin host: loading plugin bundles, their lifecycle, panels, dialogs, settings pages, stores and
  the one `ctx.ui` (`OpaqueUi.createInstance('v1', ...)` in `src/plugin/ui.tsx`).
- `src/persistence`: the widget's stored state and settings storage.
- `src/frontend-app-api.ts`: the opaque definitions conciv's shell and its own plugins share, so the public SDK exports
  none of them. `OpaqueUi` (made with `createOpaqueType` from `src/opaque.ts`): its public type is the SDK's `Ui`; its
  internal type `InternalUi` adds conciv's own members. Conciv's plugins read it with `OpaqueUi.toInternal(ctx.ui)`.
  `OpaqueNoteCard` the same way: its public type is the SDK's `NoteCard`, its internal type is the `note-card` registry
  token; the one `NoteCard` instance is made here, and the page and recorder plugins and the shell read it with
  `OpaqueNoteCard.toInternal(NoteCard)`.

Invariants: `assertPublicSet` keeps the package private, and `assertPublicTypesPublic`
fails when a public package's built types name it.
