# extensions

## Overview

Conciv extensions loaded by the TanStack Start example: the TanStack extension and a sample deploy tool and button.

## Interface

- `default` (`tanstack.tsx`): re-export of `@conciv/extension-tanstack`
- `deploy` (`deploy-button.tsx`): default export, `defineExtension({name: 'deploy', Component: DeploySurface, tools: [deployRun]})`
- `deployRun` (`deploy-button.tsx`): `defineTool` named `deploy_run`, input `{env: 'staging' | 'prod'}`, output `{url}`, `meta.mutating: true`
- `DeploySurface` (`deploy-button.tsx`): renders a `ComposerActions.ActionButton` in the `composer` slot and `env: staging` in the `status` slot
- `tsconfig.json`: Solid JSX (`jsxImportSource: solid-js`) typecheck config for this folder

## Invariants

- `deploy-button.tsx:deployRun`: `inputSchema` is `z.object({env: z.enum(['staging', 'prod'])})`; other env values are rejected
- `deploy-button.tsx:DeploySurface`: renders nothing for slots other than `composer` and `status`

## Side Effects

- `deploy-button.tsx:deployRun.server`: returns `https://${env}.example.com`; no network call is made
- `deploy-button.tsx:DeploySurface`: the composer button shows a toast through `host.useToast()`

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=tanstack-start-example` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
