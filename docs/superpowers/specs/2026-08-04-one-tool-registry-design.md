# One tool registry — an oRPC router as the single definition of every capability

Status: DESIGN — awaiting approval. Supersedes the discovery and typing halves of `2026-08-04-cli-command-contract-design.md` (its error and envelope work already shipped as #221 and stands unchanged).

User rulings (binding, in the order they were settled):

- extension-contributed capabilities are **first-class** — "yes of course it does"
- **one definition per capability**, built-ins adopt the extension mechanism — "one per verb"
- the registry covers **every** capability, not just page verbs — "one, as we already have a .client and .server it is easy to distinguish"
- **as few concepts as possible** — "the more we can remove the better it is"
- per-capability **typed errors are required** — "how will the agent know they did something wrong if we don't throw the right errors with the right types"
- oRPC generates the SDK; we do not write or codegen one

## The problem

The same 38 page verbs are written out in eleven places. Four are typed `Record<PageQueryKind, …>` and fail to compile when forgotten. **The other seven fail silently:**

| Surface                                                 | Forgetting it means                                   |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `MUTATING_KINDS` (protocol)                             | the verb is not journaled and no undo entry exists    |
| `MIRROR_KINDS` (protocol)                               | no cursor mirror, so the user never sees it happen    |
| `ELEMENT_KINDS` (page)                                  | no target element is resolved; the handler gets null  |
| `FIELD` / `flagArg` (cli)                               | the flag is accepted and then dropped before the call |
| `REACT_VERBS` (cli)                                     | the verb never appears under the react command        |
| `TYPE_VERBS` / `POINTER_VERBS` (ui-kit-chat-tools)      | wrong icon, silently                                  |
| tool description (tools), 2 system prompts, 3 doc pages | the model is told the verb does not exist             |

That last row is not hypothetical. `packages/tools/src/page.ts:14` describes the page tool to every model — chat, MCP, code mode — with a hand-written sentence listing **23 of 38 verbs**. `wait`, `attr`, `exists`, `css`, `eval` and every edit-live verb are missing. They work from the CLI and the in-widget agent does not know they exist.

Underneath all of it: one oRPC procedure, `page.run`, carrying a stringly-typed verb and a bag of ~20 all-optional fields. Nothing can be typed per verb, so every consumer rebuilt the missing knowledge by hand, and the copies drifted.

Five kinds of invokable thing exist today: built-in page verbs, extension page verbs, extension tools, built-in conciv tools, and server oRPC procedures. Four names for two ideas.

## The design

### One concept: a tool

```ts
defineTool({
  name: 'page.fill',
  inputSchema: z.object({target: Target, value: z.string()}),
  outputSchema: z.object({filled: z.boolean()}),
  errors: {
    ELEMENT_NOT_FOUND: {message: 'no element matched the target'},
    NOT_A_FIELD: {message: 'the element cannot hold a value'},
  },
  meta: {summary: 'type text into a field', category: 'act', keywords: ['type'], mutating: true, mirrors: true},
}).client(handler)
```

Where it runs is a **binding**, not a category: `.client()` runs in the browser over the bus, `.server()` runs in process. Built-ins and extension tools differ only in who wrote them. There is no verb, no page verb, no ext verb — only tools.

### The registry is an oRPC router, assembled at runtime

Each tool compiles to a procedure. A `.client()` tool compiles to a procedure whose handler forwards over the existing page bus; a `.server()` tool runs directly. Extensions contribute procedures into the same router when their module loads.

This is what makes every requirement native instead of rebuilt:

- **errors** — oRPC's own `.errors({})`, per tool, typed, narrowable with `isDefinedError`
- **metadata** — `.meta()` over a `$meta<ToolMeta>()` base, so a tool cannot exist without a summary
- **schemas** — per tool, in and out
- **types** — `RouterClient<typeof registry>`, a recursive mapped type

Transport-level failures stay on the transport, where they belong: `NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `UNKNOWN_TOOL`, `INVALID_ARGS`. Two layers of declared error, each owned by the thing that can raise it. Today the page surface declares **none** — a failed verb returns a hand-written string that is shaped exactly like a success.

### oRPC is the SDK

`createORPCClient(link)` is a Proxy over path segments: `client.a.b.c(input)` becomes `link.call(['a','b','c'], input)`. It has no runtime dependency on the contract, so a tool registered at runtime is callable with no registration step. `createRouterClient(registry)` gives the identical shape in process, with no wire.

| Consumer                     | SDK                            | Transport     |
| ---------------------------- | ------------------------------ | ------------- |
| in-widget agent, MCP, server | `createRouterClient(registry)` | in process    |
| CLI, browser page            | `createORPCClient(link)`       | RPC over HTTP |

So `conciv.page.fill({target, value})` is the same call everywhere, and an extension's `conciv.deploy.ship({...})` works the same way. **We write no facade, generate no SDK, and copy no declaration file** — three things the previous spec required, all deleted.

### Discovery: the catalog

`catalog.list()` walks the router with `isProcedure`, reading each procedure's meta and schemas; `catalog.get(name)` returns one full signature — fields, types, enum values, requiredness, and **declared errors**, so an agent learns what can go wrong before calling rather than by crashing.

Discovery stays code-only, as already settled: no search command, no describe command, and no command ever prints the catalog in full. An agent filters `catalog.list()` inside code mode and only the matched subset enters its context, so catalog size never becomes context cost.

This mirrors wrangler, which we verified rather than assumed: `experimental_getWranglerCommands()` returns a `CommandRegistry` with a walkable definition tree, and wrangler consumes it itself for shell completion.

### Environments resolve contents, never the interface

| Environment | Entries come from                                                                 | Can execute                                               |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CLI         | built-ins in the binary, plus the project's extensions loaded from disk with jiti | server tools directly; browser tools need the app running |
| running app | built-ins plus already-loaded extensions                                          | everything                                                |
| MCP         | same as the running app                                                           | everything                                                |

The CLI needs no generated artifact and no running server to answer "what can conciv do": `loadServerExtensions(root, builtins)` already reads `conciv/extensions/` through jiti, with no bundler, and is how core boots today. A tool that cannot be reached right now is still listed, marked unreachable — discovery works with the app down; only execution needs it up.

### Authoring stays co-located; the compiler splits

`splitExtension(code, id, env)` already strips `.client()` and `.render()` for node and `.server()` for browser, then dead-code-eliminates the orphans. One change is needed: the strip must be finer, rewriting a tool's client binding to keep its definition while dropping only the implementation. Authors keep writing the schema next to the handler; neither half leaks into the other bundle.

### The boundary

**If an agent can call it, it is a tool.** App plumbing stays ordinary oRPC procedures: `sessions`, `chat`, `drafts`, `markers`, `navigation`, and the `page.queries` / `page.reply` bus itself. Agents never call those. The seven `server.*` operations do become tools, because agents do call them.

This line is what keeps the work contained rather than a rewrite of the RPC layer.

## What disappears

Not "gets fixed" — ceases to exist: `PAGE_QUERY_KINDS`, `PageQuerySchema` as an all-optional bag, `PageRunInputSchema`, `MUTATING_KINDS`, `MIRROR_KINDS`, `ELEMENT_KINDS`, the `ext` wire kind and its `argsJson` with swallowed parse errors, `PAGE_VERBS`, `FIELD`, `flagArg`, `argsFor`, `REACT_VERBS`, `USER_FACING_VERBS`, `TYPE_VERBS`, `POINTER_VERBS`, the hand-written tool description, and the verb lists in both system prompts.

The CLI command tree, the model-facing schemas, MCP registration, the action-card labels, the mutation journal, and the cursor mirror all become derivations over the registry.

## Migration (expand, migrate, contract — green at every step)

1. **Expand** — add `defineTool` with meta and errors, the registry assembly, and the catalog walk, beside what exists. Nothing breaks.
2. **Bridge** — `page.run` keeps working, implemented on top of the registry, so every current caller is untouched while the truth moves.
3. **Migrate the built-ins in batches** — read verbs, act verbs, edit-live verbs, react verbs, then the server operations. Each batch deletes its rows from the parallel lists and is independently green.
4. **Derive the consumers** — CLI tree, chat and MCP tool exposure, action-card labels, journal and mirror flags.
5. **Move extensions onto the same path** — `pageVerb` becomes `defineTool(...).client(...)`, deleting the `ext` kind. This subsumes #226.
6. **Contract** — delete `page.run`, the enum, the field bag, and the parallel lists; add the guard tests.

## Testing

- **Registry guard, both directions** — every registered tool resolves, every tool has a summary that is not its own name, every declared flag has a description.
- **No silent lists** — a test asserts there is no verb-keyed list outside the registry, so the drift class cannot return.
- **Catalog** — filtering returns only the matched subset; it works with no dev server; no command prints the catalog in full; an unreachable tool is listed and marked.
- **Errors** — a declared tool error arrives typed and narrowable, carries its code through the CLI as a user error, and is visible in the catalog before the call.
- **Extensions** — a project extension's tool appears in the CLI catalog with the app down, and is callable with it up; two extensions claiming one name fail loudly at load.
- **Split** — a browser-only tool's definition survives the node strip while its handler does not.

## Risks, stated honestly

- **This is a large refactor.** It touches protocol, page, core, cli, tools, extension, extension-compiler, and ui-kit-chat-tools. The bridge step is what keeps it landable; without it this is a stop-the-world change.
- **Extension tools cannot be statically typed by the CLI binary**, which does not compile the user's project. Editors and `--file` scripts see the types; the binary relies on runtime schema validation. Built-ins are statically typed everywhere.
- **Per-tool `mutating` / `mirrors` metadata moves the answer out of one list**, which is better for authoring and worse for eyeballing "what writes to the page". The catalog can answer it on demand.
- **`isProcedure` and `~orpc.meta` are oRPC internals-adjacent.** The walk should live in one place so an oRPC upgrade has a single blast site.

## Out of scope

- Telemetry.
- Renaming capabilities for their own sake: names change only where a namespace demands it.
- Connecting the `effect` tool, which is a permanent stub today (#227) — it migrates as-is and stays absent from the catalog until implemented.
- Whether the chat agent sees tools individually or through code mode only: decidable once the registry exists, and not load-bearing for it.
