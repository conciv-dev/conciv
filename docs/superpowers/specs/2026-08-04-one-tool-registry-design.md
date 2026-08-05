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
- **one** code-mode tool, with the catalog as a binding rather than a second tool
- **one surface, every agent and every harness** — code mode only; the per-harness `codeMode` flag is deleted
- **reads auto-allow, mutations gate**, decided from each tool's own metadata
- **every capability declares an output schema**, not only an input — "we need to have schema for all as much as we can"
- **the authoring API stays one call and one binding** — "the API must stay nice and sweeeet"

## The goal

**Every capability, including every extension's, is discoverable by an agent writing code — at a context cost
that does not grow as capabilities are added.** That is the point of this work. The registry, the typed errors and
the deleted parallel lists are all means to it.

Three things follow, and they are requirements rather than consequences:

- **Code mode is the surface.** One tool, bindings supplied by the registry, discovery through a catalog binding
  inside the sandbox. Nothing enumerates capabilities in any description, so the cost of the eighty-fourth
  capability is the same as the cost of the second.
- **`conciv init` lands with it.** Init is what leaves a project able to use any of this: the installed skill
  teaches the code-mode surface, and the marked `AGENTS.md` section stops listing command groups — a mini-catalog
  is the same context bloat in a different file. Init and the registry ship as one story, not one after the other.
- **Existing extension definitions get rewritten, as many as it takes.** No compatibility shim, no two ways to
  declare a capability. Measured: **37 `defineTool` calls** across three extensions — recorder 3, tanstack 12,
  whiteboard 22 — plus 2 `pageVerbs` sites in tanstack. The other four in-repo extensions declare no tools and are
  untouched. (Whiteboard's suite is CI-only by standing rule, so its 22 are verified in CI, not locally.)

For scale, which is the whole argument: the registry lands at roughly **83 capabilities** — 38 page verbs, 7
server operations, `open`, and those 37 extension tools. Exposed one-tool-per-capability, that is the shape
Cloudflare measured at 2,594 endpoints and 244k tokens. Exposed as code mode, it is one tool description.

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
| the trust split                | `src/tools/search.ts`, `src/tools/execute.ts`                            | isolate config per tool, description structure        |
| ambient types in a description | `src/constants.ts` (`CLOUDFLARE_TYPES`), `src/openapi.ts` (`SPEC_TYPES`) | what belongs in context                               |
| result capping                 | `src/truncate.ts`                                                        | the cap and its notice                                |
| tool error shape               | `src/utils/errors.ts`                                                    | `formatError` → `{content, isError: true}`            |
| registration and the toggle    | `src/server.ts`, `src/mcp-handler.ts`                                    | how few lines this is                                 |
| schema pre-processing          | `src/spec-processor.ts`                                                  | `$ref` resolution, ranked namespace extraction        |
| a docs tool                    | `src/tools/docs-search.ts`                                               | `outputSchema` + `structuredContent` + `readOnlyHint` |
| what we skip                   | `src/auth/*`, `src/metrics.ts`                                           | OAuth and telemetry — see below                       |

## Libraries: the exact versions, and where to read them

Read the **resolved source** under `node_modules/.pnpm/`, not the published docs alone. Several claims in earlier
drafts of this spec came from docs that were wrong, silent, or stale about the installed code — the declared-error
loss, the missing search tool, and the `$ref` gap were all found by reading source after a doc implied otherwise.

Versions below are the ones this repo runs after the 0.43-line upgrade (#239). Cite a version whenever a claim
depends on library behaviour, so a later bump makes the claim re-checkable instead of quietly false.

| concern                                                               | where to read                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code-mode tool, discovery, bindings, type generation, secret scanning | `@tanstack/ai-code-mode@0.3.9` — `src/create-code-mode.ts`, `create-code-mode-tool.ts`, `create-discovery-tool.ts`, `bindings/tool-to-binding.ts`, `type-generator/json-schema-to-ts.ts`, `validate-bindings.ts`, `types.ts` |
| its shipped skill                                                     | `@tanstack/ai-code-mode/skills/ai-code-mode/SKILL.md`, or `pnpm dlx @tanstack/intent@latest load @tanstack/ai-code-mode#ai-code-mode`                                                                                        |
| where a declared error's code is destroyed                            | `@tanstack/ai-isolate-node@0.1.48` — `src/isolate-driver.ts`, `isolate-context.ts`, `error-normalizer.ts`                                                                                                                    |
| tool handler signature, custom events, the event union                | `@tanstack/ai@0.43.0` — `dist/esm/types.d.ts`                                                                                                                                                                                |
| why a runtime-registered procedure is not on the typed client         | `@orpc/server@1.14.7` — `dist/index.d.mts`, the router-client mapped type                                                                                                                                                    |
| server instructions, transport DNS-rebinding options                  | `@modelcontextprotocol/sdk@1.30.0` — `server/index.d.ts`, `server/webStandardStreamableHttp.d.ts`                                                                                                                            |
| extension config/tool type derivation                                 | `packages/extension/src/define-extension.ts`, and the existing type test `packages/extension/test/config-registry.test-d.ts`                                                                                                 |
| code mode's model requirements, with its evaluation table             | `tanstack.com/ai/latest/docs/code-mode/code-mode`                                                                                                                                                                            |
| how tools reach a sandboxed agent, and per-harness reality            | `tanstack.com/ai/latest/docs/sandbox/tools`, `/sandbox/harnesses`                                                                                                                                                            |

Two traps this table exists to prevent. A capability flag in **our** code is not evidence of a library limit —
the per-harness `codeMode` flag was an omission, not a constraint, and designing around it nearly bought us two
permanent exposure shapes. And a package's own docs can be stale against its own source: the reference server's
`AGENTS.md` says "two tools" while `src/server.ts` registers three.

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

That last row is not hypothetical. `packages/tools/src/page.ts:14` describes the page tool to every model — chat, MCP, code mode — with a hand-written sentence naming **20 of the 38 verbs** in `PAGE_QUERY_KINDS`. The 18 it omits: `route`, `console`, `attr`, `exists`, `wait`, `effect`, `setattr`, `removeattr`, `addclass`, `removeclass`, `setstyle`, `settext`, `sethtml`, `remove`, `insert`, `css`, `eval`, `ext`. They work from the CLI and the in-widget agent does not know they exist.

**The strongest evidence is one both reviews found and this spec originally missed.** The model-facing page tool does not go through `page.run` at all: it calls `ctx.page(query)`, which is wired to `pageBus.ask` (`packages/core/src/app.ts:343`), while journaling and `locate` symbolication live only in `runVerb` (`packages/core/src/page-bus.ts:148-160`). So **agent-driven page mutations are never journaled — there is no undo entry for them — and `locate` is never symbolicated for the agent.** The live-edit journal is CLI-only today. Two entry points to one capability, silently different in behaviour, is the drift this design exists to end; the `MUTATING_KINDS` row above is the weaker version of the same argument.

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

Where it runs is a **binding**, not a category: `.client()` runs in the browser over the bus, `.server()` runs in process. Built-ins and extension tools differ only in who wrote them. There is no verb, no page verb, no ext verb — only tools. Concretely that is all 38 page verbs, the 7 server operations, `open`, and every extension-contributed tool: **one concept, no second kind**. A parallel list can only drift if there is something to list.

**Output schemas are required, not optional.** Today no page verb declares one, which is why nothing downstream can state what a capability returns, and why a failure can be shaped like a result. Declaring both directions buys a typed result at every call site, structured content over MCP for free, and a catalog that answers "what do I get back" before the call. Where a return genuinely resists a schema, say so in the tool and keep it the exception.

**The authoring surface is one call and one chained binding — it does not grow.** Two fields join the existing `defineTool` (`outputSchema`, `errors`) plus the catalog metadata; nothing else. Every mechanism this design needs — the registry walk, the gate decision, the CLI tree, the model-facing schema, the sandbox binding — is a _derivation_ over that one declaration, never another thing an author writes.

### The registry is an oRPC router, assembled at runtime

Each tool compiles to a procedure. A `.client()` tool compiles to a procedure whose handler forwards over the existing page bus; a `.server()` tool runs directly. Extensions contribute procedures into the same router when their module loads.

This is what makes every requirement native instead of rebuilt:

- **errors** — oRPC's own `.errors({})`, per tool, typed, narrowable with `isDefinedError`
- **metadata** — `.meta()` over a `$meta<ToolMeta>()` base, so a tool cannot exist without a summary
- **schemas** — per tool, in and out
- **types** — `RouterClient<typeof registry>`, a recursive mapped type

Transport-level failures stay on the transport, where they belong: `NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `UNKNOWN_TOOL`, `INVALID_ARGS`. Two layers of declared error, each owned by the thing that can raise it. Today the transport declares a few codes at `packages/contract/src/contract.ts:81-85`, and the `ext` path already carries typed codes that this migration must not drop; what no page verb declares is an error of its own, so a failed verb comes back as a hand-written string shaped exactly like a success.

**Where typed errors stop working, stated up front rather than as a risk.** They hold for every caller that speaks oRPC — the CLI, in-process callers, RPC over HTTP. They do **not** reach an agent writing code in the sandbox. The installed isolate driver reduces a binding's thrown error to its `message` alone (`@tanstack/ai-isolate-node@0.1.46/src/isolate-driver.ts:203-207`) and rethrows it inside the isolate as a fresh plain `Error` (`:223-225`), and the code-mode tool then forwards only `{message, name}` (`@tanstack/ai-code-mode/src/create-code-mode-tool.ts:236-255`). The code and the "this error was declared" flag are both gone; `isDefinedError` is structurally unusable there. Patching the dependency is not permitted by repo rule.

So inside the sandbox a declared error is **text**: the code travels as a prefix on the message, and an agent branches on it by reading the exception. That is a real limitation of the surface, and the docs must say so rather than implying `isDefinedError` works everywhere.

One consequence to fix rather than inherit: `execute_typescript` never throws and never sets `isError` — a failed execution returns `{success: false, error}` as an ordinary **successful** tool result, which is precisely the failure-shaped-like-success pattern this whole design condemns. Our MCP layer maps it to `isError: true`.

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

### The agent surface: one code-mode tool

An external agent — Claude Code in a terminal — reaches the registry through MCP, and the MCP server exposes
**one tool, whatever the registry contains**. The model writes code; it never receives a tool per capability.

**Reference: `cloudflare/mcp` at `0702302` — `src/server.ts`, `src/tools/search.ts`, `src/tools/execute.ts`.
Read those three before building this section.**

| tool              | contents                                                   | trust                                                                 |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `execute({code})` | every registry tool as a binding, plus a `catalog` binding | reads auto-allow; a mutating call passes the existing permission gate |

**Ruled: one tool, with the catalog as a binding.** The alternative was a separate read-only `search` mirroring
the reference, and it is not free here. Their split is cheap because the Workers loader takes arbitrary module
source, so they interpolate the spec into a network-free isolate **as data**. We cannot: `createCodeModeTool`
throws when given zero tools (`create-code-mode-tool.ts:102-103`), so there is no binding-free sandbox;
`IsolateConfig` accepts only `bindings`, `timeout` and `memoryLimit` (`types.ts:27-41`), so there is no channel
for baking a catalog in; and the driver installs functions rather than transferable object graphs
(`isolate-driver.ts:193-228`). The catalog therefore reaches the sandbox as a binding either way, and a separate
`search` would mean re-implementing the body of `createCodeModeTool` against `driver.createContext` to buy one
thing — `readOnlyHint` on a provably non-executing tool. One tool is fewer concepts, no duplicated sandbox path,
and discovery plus action in a single round trip.

Discovery is therefore code against the `catalog` binding, inside the same sandbox:

```js
const found = await catalog.search((tool) => tool.summary.includes('class'))
```

**Ruled: reads auto-allow, mutations gate.** This is new behaviour and the reason it needs stating. Built-in
capabilities are **not gated today** — `packages/core/src/app.ts:229-234` builds the risky set from extension
tools only, and `packages/core/src/api/mcp.ts:102` registers built-ins directly, bypassing the decider extension
tools go through at `:104-110`. So an external agent currently reaches every built-in unprompted, `page eval`
included. After this, each binding consults the registry's own `mutating` metadata: a read runs, a mutation
prompts. That is what makes the metadata load-bearing rather than documentation, and it means a snapshot or a
text read never trains anyone to click through a prompt.

Note two corrections to how this spec first described the reference. Their server registers **three** tools —
`docs`, `search`, `execute` (`cf-mcp/src/server.ts:21-23`); their own `AGENTS.md` says "just two tools" and is
stale against its source. Our count is our decision, not a property of theirs.

**Their split still shows why the trust boundary is real, and we now enforce it per binding instead of per
tool.** In their `search.ts` the
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
already carry zod schemas, so each becomes a callable binding whose declaration `generateTypeStubs` renders
from the JSON schema. What the model gets back is directly callable rather than a path string it has to
assemble.

Three constraints on that, all verified in the installed library rather than assumed:

- **`$ref` must be pre-resolved, or the typing is a lie.** `json-schema-to-ts.ts:105-180` handles primitives,
  arrays, objects, enums and unions; an object that is only a `$ref` falls through to `unknown`. Zod emits refs
  for exactly the schemas we reuse most, so a shared `Target` would arrive as `unknown` — untyped precisely
  where per-tool precision was the point. `allOf`, `const`, tuples and intersections are also unsupported.
  Pre-resolution is therefore a **precondition of this design**, not a nice-to-have borrowed from the reference.
- **Do not copy the reference's resolver.** `cf-mcp/src/spec-processor.ts:18-46` carries one mutable `seen` set
  across sibling branches, so a schema legitimately reused twice gets marked `$circular` on its second
  appearance, and it resolves JSON Pointers by direct property access without decoding `~0`/`~1`. Take the
  requirement; write a per-branch ancestor-stack cycle check with proper pointer decoding, with fixtures for
  both repeated refs and real cycles.
- **A dotted name cannot be a binding name.** `isolate-driver.ts:216-228` builds each binding by evaluating a
  function _declaration_ named after the tool, so `page.fill` is a syntax error. Name mangling between the
  registry path and the sandbox identifier is part of the design, and the catalog must report the sandbox name
  alongside the registry path or an agent will write a call that cannot parse.

Bindings are always present in the sandbox — a search reveals signatures, it does not grant access.

**Results are capped with a notice, not silently cut.** Their `truncateResponse` caps at 6,000 tokens and
appends the reason plus what to do: "Response was ~N tokens (limit: 6,000). Use more specific queries to
reduce response size." We need this more than they do, because `page snapshot` on a real application can
dwarf that cap on its own.

Take the policy, not the function. `cf-mcp/src/truncate.ts:12` slices serialized JSON at a UTF-16 offset, so
the output is no longer valid JSON and can split a multi-byte character. And capping cannot be combined
naively with `structuredContent`: if the text is capped while the structured field carries the full payload,
the cap accomplishes nothing and the two disagree. So per tool: cap the text with its notice, and either return
a schema-valid truncation envelope as the structured field or omit the structured field when the cap trips.
Enforce the limit before serialization and test it with large multi-byte content.

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

Their `isolate-cache.ts` needs no equivalent — it exists to avoid an R2 round-trip per call, and our registry is
in-process.

**The DNS-rebinding guard is narrower than this spec first claimed.** Their `mcp-handler.ts` runs
`hostHeaderValidationResponse` + `originValidationResponse` against a static localhost allowlist. Ours: a
no-Origin request is not a bypass, because `originAllowed(null)` passes but `hostAllowed` still demands a
loopback Host (`packages/core/src/lib/cors.ts:20-29`), and the middleware sits ahead of `/api/mcp`
(`app.ts:181-195`). That much is verified. But "already equivalent" was wrong on three counts, two of which are
live bugs worth fixing on their own:

- a **missing** Host is accepted (`cors.ts:25-26`) — a security check that fails open
- `host.split(':')[0]` (`cors.ts:27`) turns `[::1]:PORT` into `[`, so the IPv6 loopback the allowlist explicitly
  names is rejected
- our SDK 1.29.0 exposes `enableDnsRebindingProtection` / `allowedHosts` / `allowedOrigins` on the transport,
  and `packages/core/src/api/mcp.ts:143-146` leaves all three unset. The platform-ladder rule says use the
  library's own guard rather than relying only on ours.

Note that their helpers — `createMcpHandler`, `hostHeaderValidationResponse`, `localhostAllowedHostnames` — are
from the Workers-only MCP SDK v2 and **do not exist in our 1.29.0**. Anything the reference does through them
has to be reached a different way here.

What we skip, and why: `auth/*` is 2,400 lines of OAuth and PKCE for a multi-tenant public endpoint, where ours
binds `127.0.0.1`; `metrics.ts` is telemetry, already out of scope below.

One choice of theirs we decline. They keep a non-code-mode mode behind `createServer(props, codemode = true)`,
selected per request by a `?codemode=false` query parameter, for "composition with other code mode systems" and
to avoid "~3,000 closures and Zod schemas per HTTP request". Neither reason reaches us at ~45 tools, so we ship
one path — and if `probeIsolatedVm()` reports an incompatible host, `execute` fails with what to install rather
than reviving per-tool registration. A fallback would be the entire deleted surface kept alive behind a flag.

A `docs` tool over conciv.dev is the obvious third tool and their `docs-search.ts` is the template, but it needs
its own index, so it is out of scope here.

### The in-chat agent uses the same surface

**Ruled: one surface, code mode only, in-chat as well as external.** This was previously deferred on the
grounds that the widget renders per-tool action cards a sandbox execution does not produce. **That reason was
false.** `packages/core/src/chat/code-mode-parts.ts:19-61` translates every binding call into real
`TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` chunks, carrying
`parentToolCallId` so the call nests under the enclosing code-mode call. From the UI's side a binding call is
indistinguishable from a directly-called tool, so nothing is lost.

What we have today is the opposite of consistent. `packages/core/src/chat/run.ts:110` composes
`[...deps.tools(sessionId), ...(codeMode?.tools ?? [])]`, and `buildChatTools`
(`packages/core/src/chat/runtime.ts:66-67`) registers every built-in individually **and** every extension tool
individually as lazy. So:

- built-ins are registered one by one and are **absent from the sandbox entirely**
- extension tools are exposed **twice** — individually and as bindings
- the code-mode tools sit on top of both

**Every harness, not only claude — the `codeMode` capability is on the wrong axis and is deleted.** It is set on
exactly one harness today (`packages/harness/src/claude/index.ts:49`), which reads as a constraint and is not
one. Tools reach a sandboxed agent through an **MCP tool-proxy** at the sandbox-middleware level, not through
anything harness-specific: "each tool is exposed to the agent over this proxy… The tool's `execute()` runs on
the host, keeping its DB handle, secrets, and any closures it captured." Our own codex config already depends on
that, setting `mcp_servers.tanstack.default_tools_approval_mode` whenever `deps.hasTools`. All five harnesses
declare `mcp: 'http'`, and a code-mode tool is an ordinary tool.

What varies is the **model**, not the harness: "many small or older models mishandle the `external_*` calling
conventions even when the system prompt is explicit." Their published evaluation puts every measured model at
full accuracy, with Grok 4.1 Fast, Claude Haiku 4.5 and Gemini 2.5 Flash all clean under ten seconds; the ones
it tells you to avoid are small **local** models, which "ignore shape requirements, hallucinate results, or
refuse to invoke `execute_typescript`". Haiku 4.5 is the smallest model Anthropic ships, so every model our
harnesses front sits at or above the tier that handles this cleanly.

So: one exposure shape, everywhere, and the flag goes rather than being kept to choose between two. One good way
beats two half-ways — and a capability flag that silently downgrades four harnesses onto a different surface is
precisely how eleven parallel verb lists came to exist.

Two things to verify per harness rather than assume, neither of them a reason to keep a second shape:

- whether `emitCustomEvent` from a bridged tool reaches the stream, since that is what nests a capability call
  under its enclosing code-mode call in the UI. The handler runs on the host and has the run context, but no
  doc states that every adapter threads the event through. If one drops it, fix the adapter path.
- that our generated binding names survive whatever `external_*` convention a given model expects — the same
  mangling constraint the typed-bindings section names, now with a second reason to get it right.

### Environments resolve contents, never the interface

| Environment | Entries come from                                                                 | Can execute                                               |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CLI         | built-ins in the binary, plus the project's extensions loaded from disk with jiti | server tools directly; browser tools need the app running |
| running app | built-ins plus already-loaded extensions                                          | everything                                                |
| MCP         | same as the running app                                                           | everything                                                |

The CLI needs no generated artifact and no running server to answer "what can conciv do": `loadServerExtensions(root, builtins)` already reads `conciv/extensions/` through jiti, with no bundler, and is how core boots today. A tool that cannot be reached right now is still listed, marked unreachable — discovery works with the app down; only execution needs it up.

### Authoring stays co-located; the compiler splits

`splitExtension(code, id, env)` already strips `.client()` and `.render()` for node and `.server()` for browser, then dead-code-eliminates the orphans. **No change is needed** — this spec previously claimed the strip had to be made finer; `packages/extension-compiler/src/split-extension.ts:30-36` already replaces the whole call with its receiver, which keeps the definition and drops only the implementation. Authors keep writing the schema next to the handler; neither half leaks into the other bundle.

Two real constraints do apply. The transform bails unless the source contains the literal `defineExtension`, so a tool declared in a file without it is never split. And `loadServerExtensions` splits only the **entry** file, so a tool declared in an imported module is evaluated unsplit — browser code reaching node.

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

That is affordable because `page.run` has **exactly one** non-test caller: the CLI leaf (`packages/cli/src/page.ts:135`). `packages/core/src/api/rpc/router.ts:73` is its handler, not a caller, and the model-facing tool reaches the page by a different route entirely — `ctx.page` → `pageBus.ask` — which is the divergence described in the problem statement. Everything else that touches it is a test, and tests change with the behaviour they cover.

Because the two entry points behave differently today, unifying them is a **behaviour change, not a refactor**: agent-driven mutations start being journaled and agent `locate` starts being symbolicated. That is the intended fix, and it needs its own test rather than being smuggled in as a side effect.

1. **Expand** — add `defineTool` with meta and errors, the registry assembly, and the catalog walk. Purely additive; nothing calls it yet and nothing else changes.
2. **Define the built-in tools in batches** — read, act, edit-live, react, then the server operations. Each batch moves an existing handler body and writes its schema from what the protocol already declares. The old path is untouched, not wrapped.
3. **Move the one caller and unify the second entry point**: the CLI leaf derives its command tree from the registry, and the model-facing path stops going around `runVerb`, so journaling and symbolication apply to both. Assert the new behaviour rather than assuming it.
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
- **Agent surface** — the MCP server lists exactly one tool with a registry of any size; no tool description
  contains a tool name from the registry; a read through the `catalog` binding needs no approval; a mutating
  binding call is gated, and a denial surfaces as an exception where the code called it; a result over the cap
  arrives truncated with the notice attached. Their suite is worth mirroring: `tests/executor.test.ts`,
  `tests/truncate.test.ts` in `cloudflare/mcp` at `0702302`.

## Unknowns closed by spike

Every assumption below was executed against the installed libraries rather than reasoned about. Where a spike
contradicted this spec, the spec is corrected above and the correction is named here.

**The catalog walk works, through a public API.** `traverseContractProcedures` (exported from `@orpc/server`)
walks a nested router and yields each procedure with its full path. `meta` — merged from the `$meta` base —
`errorMap` with its declared codes, and both schemas all read off the procedure, and `z.toJSONSchema` accepts
the input schema. `isProcedure` and `getRouter(registry, path)` both behave. **A procedure added after the
router object was built is found**, so runtime extension registration works for discovery. This replaces the
spec's earlier plan to hand-walk with `isProcedure` and reach into procedure internals.

**But the walk is path-driven.** One procedure object registered at three paths is reported at all three, so a
double-registered capability appears three times in the catalog. The registry needs a uniqueness guard; nothing
in oRPC provides one.

**`.meta()` cannot be made type-required**, so "a tool cannot exist without a summary" is enforced by our own
`defineTool` or not at all. The `$meta` base supplies a default that a missing `.meta()` silently inherits.

**Corrected: reused schemas do not produce `$ref`.** zod 4 inlines a schema used twice; `$ref` appears only for
genuine recursion (`{"$ref": "#"}`). The spec previously claimed a shared `Target` would arrive as `unknown`,
which is false. What remains true: the type generator renders a `$ref` as `unknown`, and a cycle cannot be
inlined away — so the day `tree` gets a recursive output schema, its stub needs hand-shaping or a flattened
schema. No schema in the protocol is recursive today.

**`defineTool` already exists** (`packages/extension/src/define-tool.ts`) with `name`, `description`,
`inputSchema`, `promptSnippet`, `promptGuidelines`, `streamTitle`, and **`approval?: 'ask'`** — so per-tool gating
metadata has a precedent, and the reads-auto-allow ruling widens an existing field rather than inventing one.
What is missing is `outputSchema`, `errors`, the catalog metadata, and `.client()`. Browser capabilities today
arrive through `pageVerbs` on `ClientFactoryResult`, a separate mechanism, which is exactly what `.client()`
replaces. **This ticket is a widening, not a new tool system.**

**The `.server()` / `.client()` split works, verified by running the transform.** For `node`,
`defineTool({...}).client(handler)` becomes `defineTool({...})` — definition kept, handler dropped — while
`.server()` survives; for `browser` the mirror. The spec's earlier claim that the strip "must be made finer" was
wrong, and so was the correction's implication that nothing needs doing, because the same run exposed two live
defects:

- **A file without the literal `defineExtension` is not split at all** — `splitExtension` returns `null` on the
  marker check. A tool declared in a module that does not itself call `defineExtension` keeps its browser handler
  in the node bundle. Since the whole point is that tools are declarable anywhere, `defineTool` has to be a
  marker too.
- **The strip matches on method name alone, across any object.** `view.render({mode: 'fast'})` became `view;` in
  the node build, and an `api.server({port: 1})` survives only because `server` is kept for node. `render` and
  `server` are ordinary method names, so the transform silently deletes calls it was never aimed at. It must
  match calls on a tool or extension builder, not any member call with those names.

### The remaining unknowns, closed

**Sandbox binding names — `external_` prefixed, and a dotted name is a hard error.** `createCodeMode` builds
each binding as `external_<tool.name>`, and the driver evaluates a function _declaration_ with that name, so
`page.fill` produces `external_page.fill` and fails at eval with `SyntaxError: Unexpected token '.'`. Verified by
running it. `external_page_fill({value: 'hello'})` returns `{"success":true,"result":{"filled":true}}`. Mangling is
mandatory; `sanitizeIdentifier` in `packages/core/src/chat/code-mode.ts` already implements the rule, so the
registry only has to keep and expose the path-to-binding mapping.

**The type stubs come free from the schemas.** The generated system prompt already contains
`declare function external_page_fill(input: External_page_fillInput): Promise<External_page_fillOutput>;` derived
from the tool's own schemas. This is what makes the output-schema requirement pay for itself — the ambient types
an agent needs are generated, never hand-written. Output schemas are also _enforced_: an extra key in a handler's
return is stripped before the agent sees it.

**Secret-parameter scanning defaults to `'warn'`** — a `console.warn`, non-fatal
(`validate-bindings.ts`, options `ignore` / `warn` / `throw` / callback, matched on word boundaries so
`accessToken` hits and `tokenizer` does not). The library calls it "best-effort heuristic, not a security
boundary". We set **`throw`, everywhere**: a credential in a capability's input schema is a design error, not a
runtime condition.

**Custom events from a bridged tool do reach the stream, on every harness.** This decides whether action cards
survive code mode away from claude, and the answer is yes: all four adapters — `ai-acp`, `ai-claude-code`,
`ai-codex`, `ai-opencode` — create a `BridgeEventChannel`, and `acp` is what pi and gemini run on. The bridge's
own contract states the stakes: "Without it those events are silently dropped — the bridge runs out-of-band from
the main tool executor, so the executor's own `emitCustomEvent` never reaches a bridged tool. The harness adapter
supplies one that injects a CUSTOM chunk into its live output stream."

**`isolated-vm` is compatible here** — `probeIsolatedVm()` returns `{"compatible":true}`, and a full
`createCodeMode` execution ran end to end during these spikes.

Nothing in this design is now unverified. The one remaining piece of known work before execution is #239: five
type errors in `@conciv/core` from the `ai-sandbox` 0.3.0 restructure, deliberately left red so it is the first
thing anyone fixes.

## Constraints found in review

Two reviews (fable and codex `gpt-5.6-sol`) read this spec against the code and the reference. Their confirmed
findings are folded into the sections above, and both open decisions are now settled — one tool with the catalog
as a binding, and reads auto-allow while mutations gate. What is left is named work.

Work items the design implies and did not name:

- **Extension tool types reuse the augmentation pattern we already have, widened — nothing new is invented.**
  `RouterClient<T>` maps `[K in keyof TRouter]` (`@orpc/server@1.14.7/dist/index.d.mts:789-790`), so a tool an
  extension registers at runtime is callable — the client is a pure path Proxy — but absent from the type. The
  existing answer is one **derived** line, not a hand-written shape:

  ```ts
  declare module '@conciv/protocol/config-types' {
    interface ExtensionConfigRegistry extends RegisterExtension<typeof demo> {}
  }
  ```

  (`packages/extension/test/config-registry.test-d.ts:9-11`.) `RegisterExtension` reads the name and config
  schema off the builder itself (`define-extension.ts:93-98`). The gap for tools is one underscore: the same
  conditional already captures the tools type and discards it —
  `ExtensionBuilder<infer Name, infer Schema, infer _Tools, …>`. Project `_Tools` instead of dropping it, and
  have the tool client read the same registry interface. No cast, no escape hatch, and no second mechanism.

  While doing it, converge the two augmentation targets. `apps/conciv/src/extensions/highlight.tsx:141-145`
  augments `Register` in `@conciv/extension` and **hand-writes** `{context: Record<never, never>}`, restating
  what the builder already knows. Derived is the model; a third target would be the wrong direction.

- **Bindings are built once.** `makeCodeMode` converts a tool array into static bindings at construction
  (`packages/core/src/chat/code-mode.ts:73-90`, `create-code-mode-tool.ts:106-108`). An extension that loads
  after the server is built will not appear. Either version the registry and rebuild on change, or use a
  dynamic binding supplier deliberately — and test it by loading an extension after construction.
- **Secret-parameter scanning already exists and has no policy.** `validate-bindings.ts:149-197` scans schemas
  for credential-shaped parameter names, and `create-code-mode-tool.ts` runs it. Putting every registry tool in
  the sandbox makes this load-bearing: pick the production behaviour and make it throw in CI.
- **Category is not bounded by construction.** Extensions supply a category string, so the "bounded sample" in
  a tool description is only bounded if the schema closes the set or the sample is hard-capped and ranked.
- **The catalog walk is verified, not assumed** — see "Unknowns closed by spike" below. It uses oRPC's own
  `traverseContractProcedures`, so it is not internals-poking. One guard it revealed: a procedure registered at
  two paths is reported at both, so the registry needs a uniqueness check.
- **Per-call isolation needs its own tests** — state leakage between executions, timeout, memory exhaustion,
  cleanup — not just tool counts and gating.

## Risks, stated honestly

- **This is a large refactor.** It touches protocol, page, core, cli, tools, extension, extension-compiler, and ui-kit-chat-tools. What keeps it landable is that the registry is additive until step 3 and that `page.run` has only one non-test caller — not a compatibility layer.
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
