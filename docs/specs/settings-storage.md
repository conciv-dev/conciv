# Settings storage: Devframe's settings contract on conciv's engine

Status: approved direction (Omri, 2026-11-09, "B"). Second PR of the settings stack (on top of #778).
Replaces the #592 layered-settings design; #592 is not ported.

## Goal

A Devframe plugin's settings code works on conciv unchanged. We implement Devframe's settings contract
(v1.3.2, `packages/devframe/src/{settings-store.ts,node/settings.ts,client/settings.ts,types/scope.ts}` in
`/Users/omrikatz/Public/web/_ref/devframe`, read from `origin/main`) exactly: same surface, same semantics,
same file layout. Only the wire differs: conciv syncs over its own oRPC instead of Devframe's shared-state RPC.
No `devframe` dependency.

Read those four Devframe files in full before writing code. Where this spec and Devframe disagree, Devframe
wins; say so in the report.

## The contract (identical to Devframe)

```ts
type SettingsStore<T extends Record<string, unknown>> = {
  get: <K extends keyof T>(key: K) => Promise<T[K] | undefined>
  set: <K extends keyof T>(key: K, value: T[K]) => Promise<void>
  delete: <K extends keyof T>(key: K) => Promise<void>
  all: () => Promise<Readonly<T>>
  onChange: (fn: (value: Readonly<T>) => void) => Promise<() => void>
}
type Settings<T> = {global: SettingsStore<T>; project: SettingsStore<T>}
interface SettingsRegistry {}
type SettingsForNamespace<NS extends string> = NS extends keyof SettingsRegistry ? ... : Record<string, unknown>
```

- Shapes match Devframe's `DevframeSettingsStore`, `DevframeSettings`, `DevframeSettingsRegistry`,
  `SettingsForNamespace` one to one (structural match; conciv names). Plugins type their namespace by
  declaration-merging `SettingsRegistry`.
- No schema, no defaults in the store: an unset key reads `undefined`. `onChange` fires on every local or
  remote change with the full snapshot.
- Entry points, same as Devframe's `ctx.scope(ns).settings`:
  - server: `ServerApi.scope(namespace).settings` (the object an extension's `server()` factory receives);
  - client: `getHostApi().useScope(namespace).settings` (in the extension host API), and the app uses the same.

## Storage (identical layout)

- One JSON file per scope and namespace: `<dir>/settings/<namespace>.json`.
  - `project`: `<cwd>/.conciv/settings/<namespace>.json` (conciv's per-checkout private state dir, the same
    `stateDir` extensions already get).
  - `global`: `<concivHome>/settings/<namespace>.json` (`concivHome()` from `@conciv/db`).
- Writes: debounced 100ms, then write `<file>.<pid>.tmp` and rename over the file (atomic), `mkdir -p` first;
  pretty JSON with a trailing newline, like Devframe's `createStorage`.
- Reads: `JSON.parse` with Devframe's reviver that drops `__proto__` / `constructor.prototype`. A corrupt file
  logs a warning and starts empty (Devframe's DF0012 behaviour); it is never overwritten until the next `set`.
- Namespace safety: reject a namespace containing `\0` or resolving outside the settings dir (Devframe's
  `relative` check), plus zod-validate it at the RPC boundary.
- One in-memory store per (scope, namespace) on the engine, created lazily, shared by every caller.

## Wire (conciv oRPC)

In `packages/contract/src/contract.ts`, a `settings` group, every input zod-validated:

- `settings.all({scope, namespace})` returns the snapshot;
- `settings.set({scope, namespace, key, value})`, `settings.delete({scope, namespace, key})`;
- `settings.changes({scope, namespace})`: `eventIterator` of full snapshots (first event = current snapshot),
  the same pattern as `sessions.changes`.

Behind the existing engine trust (same as every other procedure; untrusted callers get nothing). The client
store keeps the latest snapshot from `changes` and resolves `get`/`all` from it after the first event, the way
Devframe's client waits for the initial snapshot before the first read or write.

## conciv's own settings

The app's own user settings (the settings page in the next PR) use the same store under namespace `conciv`,
the way Devframe's hub keeps its dock and shortcut preferences in a settings shared state. Host-fixed config
(`conciv({...})` options, today's `ConcivSettings` in `apps/conciv/src/data/settings.ts`) stays read-only, like
Devframe's `connectionMeta.configs`.

## Tests

- Core node test file: add a `describe` that boots the engine (existing helpers), writes through the server
  store and through RPC, and asserts the JSON file contents, the debounce (one write for a burst), the atomic
  rename (no `.tmp` left), `onChange` delivery to a second RPC subscriber, a corrupt file starting empty, and a
  traversal namespace rejected.
- Tests use a temp `cwd` and temp `concivHome`; never the real home.
- One journey per behaviour group, no test per edge case. No mocks.

## Rules (all apply)

Functions, not classes. No IIFEs. Zero comments. No `any` / `as` / `!` / `@ts-ignore`. No em dashes. zod at
every trust boundary. Handle every error (no floating promises). No new test files. Changeset (patch, the
`@conciv/*` set). `pnpm exec fallow audit --changed-since main --format json --quiet`: nothing INTRODUCED.
Commit locally on `feat/settings-storage` in `/Users/omrikatz/Public/web/aidx-wt-settings-storage`. Do NOT push.
Do NOT open a PR.

## Out of scope

The settings page and routes (next PR). Extension settings pages generated from a declared shape (later PR).
