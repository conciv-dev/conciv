# src

## Overview

Router factory, TanStack Start instance with request middleware, generated route tree, and the components, lib and routes folders.

## Interface

- `getRouter()` (`router.tsx`): router with a `QueryClient` wrapper, `defaultPreload: 'intent'`, `defaultNotFoundComponent: NotFound`
- `startInstance` (`start.ts`): `createStart` with `csrfMiddleware` and `llmMiddleware`
- `routeTree` (`routeTree.gen.ts`): generated; do not edit
- Subdirectories: [components](./components/README.md), [lib](./lib/README.md), [routes](./routes/README.md)

## Invariants

- `start.ts:csrfMiddleware`: CSRF checks apply to server functions (`handlerType === 'serverFn'`)
- `start.ts:llmMiddleware`: a `/docs` request that prefers markdown (`isMarkdownPreferred`) and does not end in `.md` is redirected to the `.md` path

## Side Effects

- `start.ts:llmMiddleware`: issues redirects

## Verification

- Run: `cd apps/site && pnpm typecheck && pnpm lint && pnpm test`
