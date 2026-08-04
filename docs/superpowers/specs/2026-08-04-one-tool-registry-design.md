# One tool registry — an oRPC router as the single definition of every capability

Status: DESIGN — awaiting approval. Supersedes the discovery and typing halves of `2026-08-04-cli-command-contract-design.md` (its error and envelope work already shipped as #221 and stands unchanged).

User rulings (binding, in the order they were settled):

- extension-contributed capabilities are **first-class** — "yes of course it does"
- **one definition per capability**, built-ins adopt the extension mechanism — "one per verb"
- the registry covers **every** capability, not just page verbs — "one, as we already have a .client and .server it is easy to distinguish"
- **as few concepts as possible** — "the more we can remove the better it is"
- per-capability **typed errors are required** — "how will the agent know they did something wrong if we don't throw the right errors with the right types"
- oRPC generates the SDK; we do not write or codegen one
- the external agent reaches the registry through a **code-mode MCP server**, modelled on `cloudflare/mcp` —
  "let's do the MCP like they did", "this seems like the right one to inspire from"

## Reference implementation — read it before writing any part of this

Everything about the agent surface is modelled on a real, working, open-source server. **Read the source, not
this summary of it**, whichever part of the plan you are working on.

- **Repo:** `https://github.com/cloudflare/mcp` — the Code Mode server behind `mcp.cloudflare.com`
- **Commit this spec was written against:** `0702302`
- **Get it:** `git clone --depth 1 https://github.com/cloudflare/mcp.git`
- **Not to be confused with** `cloudflare/mcp-server-cloudflare`, which is the older per-operation shape: 15
  domain servers of typed tools. Their docs contrast the two directly, and it is the shape we are moving away
  from.

Their own numbers for the same move, from that repo's README:

| approach                                    | tools | token cost | share of a 200K context |
| ------------------------------------------- | ----- | ---------- | ----------------------- |
| native MCP (minimal — required params only) | 2,594 | 244,047    | 122%                    |
| code mode                                   | 3     | ~1,100     | 0.5%                    |

Where to look, by concern:

| concern                        | their file                                                               | what to take                                          |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| the two tools, trust split     | `src/tools/search.ts`, `src/tools/execute.ts`                            | isolate config per tool, description structure        |
| ambient types in a description | `src/constants.ts` (`CLOUDFLARE_TYPES`), `src/openapi.ts` (`SPEC_TYPES`) | what belongs in context                               |
| result capping                 | `src/truncate.ts`                                                        | the cap and its notice                                |
| tool error shape               | `src/utils/errors.ts`                                                    | `formatError` → `{content, isError: true}`            |
| registration and the toggle    | `src/server.ts`, `src/mcp-handler.ts`                                    | how few lines this is                                 |
| schema pre-processing          | `src/spec-processor.ts`                                                  | `$ref` resolution, ranked namespace extraction        |
| a docs tool                    | `src/tools/docs-search.ts`                                               | `outputSchema` + `structuredContent` + `readOnlyHint` |
| what we skip                   | `src/auth/*`, `src/metrics.ts`                                           | OAuth and telemetry — see below                       |

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

### The agent surface: two code-mode tools

An external agent — Claude Code in a terminal — reaches the registry through MCP, and the MCP server exposes
**two tools, whatever the registry contains**. The model writes code; it never receives a tool per capability.

**Reference: `cloudflare/mcp` at `0702302` — `src/server.ts`, `src/tools/search.ts`, `src/tools/execute.ts`.
Read those three before building this section.**

| tool              | contents                         | trust                                                 |
| ----------------- | -------------------------------- | ----------------------------------------------------- |
| `search({code})`  | the catalog, read-only           | pure; no tool execution, so nothing to gate           |
| `execute({code})` | every registry tool as a binding | each binding call passes the existing permission gate |

**Two tools rather than one because the split is a trust boundary, not ergonomics.** In their `search.ts` the
isolate is created with `globalOutbound: null` and the tool is annotated `readOnlyHint: true`; in `execute.ts`
it gets a proxy that rejects every host but the API base and attaches the token _outside_ the code isolate,
which their comment states plainly: "token comes from props, never enters user code isolate". Our equivalent
is finer-grained — we gate per binding rather than at the network layer, because the registry knows what each
tool does.

**Types are described; the catalog never is.** Their `execute` description inlines `CLOUDFLARE_TYPES` (the
`cloudflare.request` signature, `declare const accountId`) and `search` inlines `SPEC_TYPES`
(`declare const spec`). Neither description lists an endpoint. The single bounded exception is a hard-capped
namespace sample, `products.slice(0, 30)` followed by the total. Ours does the same with category names, which
are bounded by construction. **No description anywhere lists tools** — that is the same rule the eleven
parallel verb lists violate, applied to the model-facing surface.

Bindings are real and typed, which is where we should diverge from them. Their sandbox holds one function,
`cloudflare.request({method, path, body})`, because 2,594 typed bindings is absurd; ours holds ~45 tools that
already carry zod schemas, so each becomes `external_<name>(input)` and `generateTypeStubs` in
`@tanstack/ai-code-mode` renders its declaration from the JSON schema. `search` returns those declarations, so
what the model gets back is directly callable rather than a path string it has to assemble. The bindings
themselves are always present in the sandbox — search reveals signatures, it does not grant access.

**Results are capped with a notice, not silently cut.** Their `truncateResponse` caps at 6,000 tokens and
appends the reason plus what to do: "Response was ~N tokens (limit: 6,000). Use more specific queries to
reduce response size." We need this more than they do, because `page snapshot` on a real application can
dwarf that cap on its own.

**One sandbox, two callers.** `packages/core/src/chat/code-mode.ts` already builds the in-chat code mode from
`createCodeMode` in `@tanstack/ai-code-mode`; the MCP server calls the same function over the same registry
and the same `PermissionGate`. The terminal agent runs the widget's sandbox, not a second implementation of
it — which is the capability parity that motivated this section. The code-mode usage contract ships as the MCP
server's `instructions` (`ServerOptions.instructions`, present in `@modelcontextprotocol/sdk` 1.29.0,
delivered at initialize), so it costs no tool.

What this deletes from `packages/core/src/api/mcp.ts`: the per-tool `registerTool` loop over `concivTools(ctx)`,
the hand-rolled `conciv_discover_tools` and its name-taking input, the `discovered: Map<string, Set<string>>`
session state, and the content conversion for N tools. Session resolution, the gate, and two registrations
remain.

### Everything else worth taking from their server

Reference for this whole subsection: `cloudflare/mcp` at `0702302`, file named per row.

| take                                                                                                                                                                                                                                                      | their source                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Code is an async arrow function, not a script body.** They bake it in as `await (${code})()` so a `return` is the result and there is one place errors surface.                                                                                         | `tools/execute.ts`, `tools/search.ts`       |
| **A failed call throws inside the sandbox.** Their `cloudflare.request` throws on `!data.success`, so the model's own `try`/`catch` works and a failure cannot be mistaken for a result. This is the sandbox end of our declared errors.                  | `tools/execute.ts`                          |
| **One error shape for every tool:** `formatError(error)` → `{content: [{type:'text', text: 'Error: …'}], isError: true}`. Eighteen lines, used everywhere, no per-tool variation.                                                                         | `utils/errors.ts`                           |
| **Validation errors carry guidance, not just the zod message.** When the failing field is the one people always get wrong, they append the how-to-fix sentence to the rejection.                                                                          | `tools/non-codemode.ts` (`validationError`) |
| **`readOnlyHint: true` on read-only tools**, plus a `title` separate from the name. Clients use annotations to decide what to auto-approve — this is how `search` stays frictionless while `execute` prompts.                                             | `tools/search.ts`, `tools/docs-search.ts`   |
| **Declare an `outputSchema` and return `structuredContent`** alongside the text, not text alone. Our registry already has an output schema per tool, so this is free.                                                                                     | `tools/docs-search.ts`                      |
| **Pre-resolve `$ref` before the model sees a schema**, with a `$circular` marker for cycles, so nothing in the sandbox has to dereference anything. Our zod → JSON Schema output does emit `$ref` for reused pieces like `Target`.                        | `spec-processor.ts` (`resolveRefs`)         |
| **Rank the bounded namespace sample by size.** `extractProducts` sorts by endpoint count descending, so the truncated hint shows the biggest namespaces rather than the alphabetically first.                                                             | `spec-processor.ts` (`extractProducts`)     |
| **The description tells the model the order to work in** — "First use the 'search' tool to find the right endpoints, then write code" — and carries one worked example of the hardest call, not one per operation.                                        | `tools/execute.ts`                          |
| **Fail fast with a sentence, never a silently wrong value.** With no account resolved they install a throwing getter rather than let `accountId` be empty, whose comment names the bug avoided: "instead of silently producing `/accounts//...` (a 404)". | `tools/execute.ts`                          |
| **A whole MCP server is small.** `server.ts` is 26 lines: register, return. If ours is much bigger, the registry is not carrying its weight.                                                                                                              | `server.ts`                                 |

Two of their choices need no work from us. Their `mcp-handler.ts` guards the deployment boundary with
`hostHeaderValidationResponse` + `originValidationResponse` against a localhost allowlist — the standard MCP
DNS-rebinding guard, which `corsMiddleware()` in `packages/core/src/lib/cors.ts` already applies to every route
including `/api/mcp` (loopback origin plus host check). And their `isolate-cache.ts` exists to avoid an R2
round-trip per call; our registry is in-process.

What we skip, and why: `auth/*` is 2,400 lines of OAuth and PKCE for a multi-tenant public endpoint, where ours
binds `127.0.0.1`; `metrics.ts` is telemetry, already out of scope below.

One choice of theirs we decline. They keep a non-code-mode mode behind `createServer(props, codemode = true)`,
selected per request by a `?codemode=false` query parameter, for "composition with other code mode systems" and
to avoid "~3,000 closures and Zod schemas per HTTP request". Neither reason reaches us at ~45 tools, so we ship
one path — and if `probeIsolatedVm()` reports an incompatible host, `execute` fails with what to install rather
than reviving per-tool registration. A fallback would be the entire deleted surface kept alive behind a flag.

A `docs` tool over conciv.dev is the obvious third tool and their `docs-search.ts` is the template, but it needs
its own index, so it is out of scope here.

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

Not "gets fixed" — ceases to exist: `PAGE_QUERY_KINDS`, `PageQuerySchema` as an all-optional bag, `PageRunInputSchema`, `MUTATING_KINDS`, `MIRROR_KINDS`, `ELEMENT_KINDS`, the `ext` wire kind and its `argsJson` with swallowed parse errors, `PAGE_VERBS`, `FIELD`, `flagArg`, `argsFor`, `REACT_VERBS`, `USER_FACING_VERBS`, `TYPE_VERBS`, `POINTER_VERBS`, the hand-written tool description, the verb lists in both system prompts, and — from the MCP server — the
per-tool registration loop and the hand-rolled `conciv_discover_tools`.

The CLI command tree, the model-facing schemas, MCP registration, the action-card labels, the mutation journal, and the cursor mirror all become derivations over the registry.

## Migration (expand, migrate, contract — green at every step)

Every step below that touches the model-facing surface has a working reference: **`cloudflare/mcp` at commit
`0702302`** (see the Reference section at the top for the file map). Whoever picks up a step should clone it and
read the relevant file first.

**No compatibility shim.** The repo rule is explicit — pre-release, no external users, reshape internal APIs freely and update all call sites. Leaving original code in place until its callers move is expand-then-contract; writing new code whose only job is to translate the old shape onto the new one is a shim, and it is the thing that becomes permanent. We do the first and never the second.

That is affordable because `page.run` has **three** non-test callers: the model-facing page tool (`packages/tools/src/server.ts:22`), its own handler (`packages/core/src/api/rpc/router.ts:73`), and the CLI leaf (`packages/cli/src/page.ts:135`). Everything else that touches it is a test, and tests change with the behaviour they cover.

1. **Expand** — add `defineTool` with meta and errors, the registry assembly, and the catalog walk. Purely additive; nothing calls it yet and nothing else changes.
2. **Define the built-in tools in batches** — read, act, edit-live, react, then the server operations. Each batch moves an existing handler body and writes its schema from what the protocol already declares. The old path is untouched, not wrapped.
3. **Move the three callers**, one per commit: the CLI leaf derives its command tree from the registry; the page tool's schema and description derive from it; the router hands off to it.
4. **Derive the remaining consumers** — action-card labels, journal and mirror flags, and chat exposure — each replacing a parallel list with a read of the registry.
   Then replace the MCP server's per-tool registration with `search` and `execute` over the registry, which is where the agent surface above lands.
   **Reference for this step: `cloudflare/mcp` at `0702302` — `src/server.ts`, `src/tools/search.ts`, `src/tools/execute.ts`, `src/truncate.ts`, `src/utils/errors.ts`. Clone and read them; do not work from this spec's summary of them.**
5. **Move extensions onto the same path** — `pageVerb` becomes `defineTool(...).client(...)`, deleting the `ext` kind. This subsumes #226.
6. **Contract** — delete `page.run`, the enum, the field bag, and every parallel list; add the guard tests that stop them coming back.

If step 3 turns out to need a translation layer to stay green, that is a signal the registry's shape is wrong — not a reason to write one.

## Tests may stay red until the end

A ruling, because it changes how this is executed: **tests are allowed to fail for the duration of the migration** and are brought back at the end. Demanding green at every step is what would force a translation layer — two systems cannot both satisfy one suite without one pretending to be the other.

Two guardrails keep that from decaying into "made green at the end":

- **Typecheck and build stay green continuously.** In a refactor of this shape that is the gate that matters: a deleted enum member or a moved schema surfaces as a compile error across all eleven surfaces in seconds, while a red suite says little about a half-moved truth.
- **Every red test is triaged, not just fixed.** _Mechanical_ — references a deleted API or asserts a shape that intentionally changed — update freely. _Behavioural_ — the thing it protected genuinely stopped working — read and understand before touching, because that is where a real regression hides.

**No test is deleted to reach green.** A test whose concept ceased to exist (an exhaustiveness check over the old enum) is replaced by its registry-guard equivalent, never dropped.

## Testing

- **Registry guard, both directions** — every registered tool resolves, every tool has a summary that is not its own name, every declared flag has a description.
- **No silent lists** — a test asserts there is no verb-keyed list outside the registry, so the drift class cannot return.
- **Catalog** — filtering returns only the matched subset; it works with no dev server; no command prints the catalog in full; an unreachable tool is listed and marked.
- **Errors** — a declared tool error arrives typed and narrowable, carries its code through the CLI as a user error, and is visible in the catalog before the call.
- **Extensions** — a project extension's tool appears in the CLI catalog with the app down, and is callable with it up; two extensions claiming one name fail loudly at load.
- **Split** — a browser-only tool's definition survives the node strip while its handler does not.
- **Agent surface** — the MCP server lists exactly two tools with a registry of any size; no tool description
  contains a tool name from the registry; `search` cannot execute a tool; a binding call inside `execute` is
  gated, and a denial surfaces as an exception where the code called it; a result over the cap arrives
  truncated with the notice attached. Their suite is worth mirroring: `tests/executor.test.ts`,
  `tests/truncate.test.ts`, `tests/mcp-client.test.ts` in `cloudflare/mcp` at `0702302`.

## Risks, stated honestly

- **This is a large refactor.** It touches protocol, page, core, cli, tools, extension, extension-compiler, and ui-kit-chat-tools. What keeps it landable is that the registry is additive until step 3 and that `page.run` has only three non-test callers — not a compatibility layer.
- **Extension tools cannot be statically typed by the CLI binary**, which does not compile the user's project. Editors and `--file` scripts see the types; the binary relies on runtime schema validation. Built-ins are statically typed everywhere.
- **Per-tool `mutating` / `mirrors` metadata moves the answer out of one list**, which is better for authoring and worse for eyeballing "what writes to the page". The catalog can answer it on demand.
- **Code mode moves the failure from a rejected call to a thrown exception inside someone else's sandbox.** A
  model that writes wrong code gets a stack trace rather than a typed rejection, so the declared errors have to
  survive the binding layer intact or the whole error argument is lost at the last hop.
- **`isProcedure` and `~orpc.meta` are oRPC internals-adjacent.** The walk should live in one place so an oRPC upgrade has a single blast site.

## Out of scope

- Telemetry.
- Renaming capabilities for their own sake: names change only where a namespace demands it.
- Connecting the `effect` tool, which is a permanent stub today (#227) — it migrates as-is and stays absent from the catalog until implemented.
- A `docs` tool over conciv.dev: the natural third agent-facing tool, but it needs its own index.
- Whether the **chat** agent sees tools individually or through code mode only. The external agent is settled
  above — code mode only. In-chat the question is different, because the widget renders per-tool action cards
  that a sandbox execution does not produce, so it is decided after the registry lands.
