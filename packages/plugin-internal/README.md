# @internal/plugin

Private, never published, inlined into the builds that use it: the opaque definitions conciv's app and its own
plugins share, so the public `@conciv/plugin` SDK exports none of them. Shaped as Backstage's `@internal/frontend`
(`wiring/InternalExtensionDefinition.ts`).

- `src/index.ts`: `OpaqueUi` and `OpaqueNoteCard`, each made with `OpaqueType.create` from `@internal/opaque`, the
  whole internal shape written inline in its generic. `OpaqueUi`'s public type is the SDK's `Ui`; its `v1` adds
  conciv's own members with their props. `OpaqueNoteCard`'s public type is the SDK's `NoteCard`; its `v1` is the
  `note-card` registry token. The app creates `ctx.ui` with `OpaqueUi.createInstance('v1', ...)`, the SDK creates
  `NoteCard`, and conciv's plugins and the app read them with `toInternal`. A parameter that needs the internal type
  names `typeof OpaqueUi.TInternal` (props through `Parameters<>`), as Backstage does.

Invariants: the package exports only `OpaqueUi` and `OpaqueNoteCard`. `assertPublicSet` keeps it private, and
`assertPublicTypesPublic` fails when a public package's built types name it.
