# @internal/plugin

Private, never published, inlined into the builds that use it. Conciv's port of Backstage's `@internal/frontend`
(`packages/frontend-internal`): the opaque definitions conciv's app and its own plugins share, so the public
`@conciv/plugin` SDK exports none of them.

- `src/index.ts`: `OpaqueUi`, made with `createOpaqueType` from `@internal/opaque` (Backstage's
  `wiring/InternalFrontendPlugin.ts` `OpaqueFrontendPlugin` shape). Its public type is the SDK's `Ui`; its internal
  type `InternalUi` adds conciv's own members, with their prop types (`Internal*Props`, `MentionItem`,
  `MentionSegment`, `MentionFieldApi`). The app creates the one `ctx.ui` with `OpaqueUi.createInstance('v1', ...)`;
  conciv's plugins read it with `OpaqueUi.toInternal(ctx.ui)`.

Invariants: no helper, guard or re-export lives here unless Backstage keeps the same kind of thing in
`@internal/frontend` and conciv needs it. `assertPublicSet` keeps the package private, and `assertPublicTypesPublic`
fails when a public package's built types name it.
