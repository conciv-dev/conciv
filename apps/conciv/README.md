# conciv

The conciv app: a TanStack Solid Router UI over the `@conciv/contract` rpc surface.
Private, never published. `@conciv/embed` inlines it into the embed bundle; standalone
dev runs it against a core dev server: `pnpm dev`, then open
`http://localhost:3000/?core=http://127.0.0.1:<core-port>`.

Routes are the layout: `/` closed, `/panel/$sessionId/$view` panel, `/quick` quick
terminal layer, `/pip/$sessionId` picture-in-picture. Embedded runs use
`@conciv/storage-history` (db-persisted); standalone uses browser history.

Behavioral coverage lives in `packages/embed`'s real-browser ITs; this package only
unit-tests pure parsers plus the router-restore path (vitest browser project).
