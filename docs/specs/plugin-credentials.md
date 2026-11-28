# Plugin credentials and integrations

Status: ruled 2026-11-28 by the maintainer (design plugin ruling D6, option A). Lands on main on its own, before the
design plugin reads its Figma key. Needs the maintainer's merge yes (it changes core packages).

## Why

A plugin that calls a third-party service needs a secret (the design plugin: a Figma key). A secret in plugin options
reaches the browser: the plugin host decodes every plugin's options into its experimental part
(`backend-app-api/src/core/plugin/module.ts`, `loadExperimental(..., operation.options)`). Secrets therefore never go
in options. They are stored per user as credentials of an integration a plugin declares, and only the engine reads them.

## Rulings

1. Port the reference engine's credential and integration system verbatim into conciv: the stored credential service,
   the integration registry with its methods (`oauth`, `command`, `key`, `external`, `env`), the connection resolver,
   the forms a method asks, and the plugin domains `ctx.credential` (`activate`) and `ctx.integration`. Same names,
   same behaviour, same file split, adapted only where conciv's own rules require it (below). No carve-outs: every
   method kind comes over.
2. No reference to the upstream project anywhere: not in code, identifiers, service keys (`@conciv/...`), file names,
   comments, test names, commit messages, the changeset or the PR text. The code reads as conciv's own.
3. Verbatim means verbatim: every feature, field, method, event, error and behaviour the reference has comes over,
   the credential listing's `value` included. Nothing is added or changed in behaviour; the port makes no decisions.
   The only changes are conciv's mechanical rules below (names, file homes, zod at rpc inputs, no comments, file size).
4. Compatibility for data conciv never had stays out, as it carries no feature: the legacy credential shape
   (`credential-legacy.ts`, which only maps old stored rows' `configuration` to `metadata`; rows decode with
   `Credential.Value`), the legacy credential import migration, and the `@deprecated` aliases (the integration api's
   `wellknown` alias).
   WellKnown (remote config sources, `experimental.integration.wellknown.add`, its login plugin) and the config
   documents it feeds are not part of credentials: nothing in the credential or integration code imports them and the
   plugin domain omits `wellknown`. They stay out, for a config port of their own.

5. Ruled 2026-11-28, the one behavioural change from the source: every secret in a credential value (a key, an oauth
   access and refresh token, an external credential's secret) is an Effect `Redacted<string>` everywhere in the engine
   and the plugin API (`Schema.Redacted` in the credential schemas). Code that needs the secret for a request reads it
   with `Redacted.value` at that call; printing, logging, tool output and JSON encoding give `<redacted>`, so no agent
   and no browser ever receives it. Only the credential table stores the plain value, through an explicit encode in
   the credential service. The rpc listing's `value` therefore carries the redacted form.
   A database failure in the credential service is logged with its query parameters replaced by `[redacted]` and dies
   with an error that carries only the error types, since a driver error carries the bound values (the secret).

## Where each piece goes

Mirror where conciv's earlier ports of the same engine put the sibling files (`bus.ts`, `state.ts`, `database/`,
`permission/saved.ts` + `permission/sql.ts`, `managed-policy.ts`, the Effect plugin domains). In short:

| Reference                                                                     | conciv                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema/src/{credential,connection,form,integration,integration-id}.ts`       | where conciv already keeps the ported schema modules the core services import                                                                                                       |
| `core/src/credential.ts`, `core/src/credential/sql.ts`                        | `backend-app-api/src/core/credential.ts`, `credential/sql.ts`; the table joins conciv's drizzle schema and its generated migrations (`backend-defaults/src/db/migrations.gen.ts`)   |
| `core/src/integration.ts` (850 lines), `integration/connection.ts`, `form.ts` | `backend-app-api/src/core/integration.ts` split under 600 lines by concern, `integration/connection.ts`, `form.ts`                                                                  |
| `core/src/config/integration.ts`                                              | the integration part of conciv's config, where conciv's config schema lives                                                                                                         |
| `plugin/src/effect/integration.ts`, `plugin/src/promise/integration.ts`       | `backend-plugin-api/src/effect/integration.ts`, `src/promise/integration.ts`; `Context` gains `credential` and `integration` on both entries; `fromPromise` adapts the promise twin |
| the plugin host giving `ctx.credential` / `ctx.integration`                   | conciv's plugin registry (`backend-app-api/src/core/plugin.ts`), registrations scoped to the plugin as every other domain                                                           |
| `server/src/handlers/{credential,integration}.ts` (HTTP)                      | oRPC procedures in `@conciv/protocol`'s contract (zod `oc.input`) and their handlers in `backend-defaults/src/engine`; all browser-engine traffic is oRPC over the WebSocket        |
| the file lock around a refresh                                                | Effect's own primitive conciv already uses for cross-process locks, or ask if none exists                                                                                           |

A dependency is asked only if it is new to the repo. A file that has no home by the rule above is asked, not guessed.

## Conciv rules that adapt the port

Effect entry and Effect services throughout (no async, no `.then`, no Promise chains in product code; typed errors,
none swallowed); no module state (the reference's `pending` map lives inside the service's layer, which is allowed:
it is owned state, not module state); zero comments (JSDoc goes, names carry it); no `Of` suffix; files under ~600
lines; zod at every rpc input; never log a secret value (log ids and types only, as the reference does).

## Out of this PR

- The widget screen where a user connects an integration (settings, the key form, the oauth flow): the next PR, its
  own spec section once this lands. The rpc this PR adds is what that screen calls.
- The design plugin's switch from `figma: {token}` to a `figma` integration with a `key` and an `env`
  (`FIGMA_API_KEY`) method: phase 3a of `design-plugin-migration.md`, after this merges.

## Tests

As AGENTS.md "Testing", lean, one describe per user flow:

- `backend-app-api` (or wherever the service lands) `test/unit`: the credential store on the in-memory database:
  create activates, a second create with `activate: false` keeps the first, remove switches to the newest remaining,
  refresh shares one run between concurrent callers and keeps a row changed meanwhile.
- `backend-defaults` `test/it`: one engine journey with a test plugin that declares an integration with a `key`
  method: the rpc lists it, connects a key, the listing shows the credential, the plugin's
  `ctx.integration.connection.resolve` returns the key; an `env` method resolves from the engine's env
  (`start.env`, never a process env write).
- Every new case accounted for against `test-budget.json` in the PR body.
