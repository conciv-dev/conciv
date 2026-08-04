# conciv CLI command contract — code-mode discovery, typed execution, honest errors

Status: DRAFT — awaiting user approval. Scope: `conciv tools …` (every verb) plus `conciv init`, as consumed by AI agents first and humans second.

User rulings (binding):

- "we need our CLI to work like wrangler CLI when it comes to all the tools and verbs"
- "make sure this CLI works good for agents and doesn't swallow stuff, we should have proper help and everything"
- "the agent must have a way to run code and load the relevant skills on demand"
- "don't we want the command to generate code using codemode like they are doing?"
- "our search should also be code only like theirs" — **no string-query search command; discovery happens by writing code**
- search-as-code and reusable snippets are part of this plan, not deferred

## The asymmetry this fixes

conciv's **in-chat** agent already has the modern setup: every extension tool is registered `lazy: true` (`packages/core/src/chat/runtime.ts:53,67`) and `packages/core/src/chat/code-mode.ts` builds a real code-mode surface with `createCodeMode` from `@tanstack/ai-code-mode`, per the implemented plan `docs/superpowers/plans/2026-07-19-lazy-discovery-code-mode.md` ("shrinking conciv's standing system prompt to near zero").

An **external** agent — a terminal claude/codex session shelling out to our CLI — gets none of it: 38 page verbs whose descriptions are their own names, no discovery, no composition, and a raw undici stack trace when the dev server is down. Same product, two wildly different capabilities.

## Measured baseline (current build, 2026-08-04)

- `conciv tools page --help` lists 38 verbs described as themselves (`page click` → "page click"). Cause: `packages/cli/src/page.ts` generates `description: \`page ${verb}\``.
- No dev server ⇒ `TypeError: fetch failed` plus four lines of undici stack. The exit code is correct (1) — failures are not swallowed — but nothing names the cause, the port, or the fix.
- Verb results are already JSON (`request.ts:runRpc` writes `JSON.stringify(result)`); missing are a stable envelope and a JSON error shape. `init` has no JSON mode.
- An unknown verb prints the parent help with no suggestion.

## What the references actually do (source-read 2026-08-04)

**wrangler** (cloudflare/workers-sdk): a `createCommand`/`createNamespace` factory whose type requires `metadata: {description, status, owner, category?, examples?, epilogue?}`; `describe` on every arg; `positionalArgs` declared; a `behaviour` block so commands "only diverge intentionally"; handler context carrying `{logger, confirm, prompt, isNonInteractiveOrCI, errors: {UserError, FatalError}}`; `UserError` prints its message with the stack at debug only and no bug-blame, everything else gets stack + "may be a bug" + telemetry; `logDidYouMean` on typos. Their CLI has no agent-facing search — `wrangler docs <terms>` searches only to open a browser — and their agent story is skills installed to disk (`agents-skills-install.ts`, `detect-agent.ts`).

**Cloudflare Code Mode** (`/agents/tools/codemode/`, `/agents/model-context-protocol/codemode/`): two patterns — a single `code` tool carrying typed methods for every upstream tool, or `search` + `execute` for large APIs. Crucially **their search is code, not a query**: the model writes `const spec = await codemode.spec(); return Object.entries(spec.paths).filter(…)`, the complete document stays inside the sandbox, and only the filtered subset enters context. Their `/agents/concepts/tools/` page presents direct tool calls and Code Mode as a choice of _interface_ — direct "when the task is simple and uses a small, known tool set", Code Mode "when the task needs composition, dependent calls, filtering, branching, repeatable logic, or tool discovery". Successful programs can be saved as reusable snippets.

**Us**: `@tanstack/ai-code-mode` (installed, in use) exports `createCodeMode`, `createCodeModeTool`, `createDiscoveryTool`, `toolToBinding`/`toolsToBindings`, `generateTypeStubs`, `jsonSchemaToTypeScript`, `stripTypeScript`, `wrapCode`; `@tanstack/ai-isolate-node` provides the driver. `packages/contract` already exports `RpcClient = ContractRouterClient<typeof contract>` — the whole API typed from one zod contract. Nothing new to install.

## Design

### 1. One catalog, four consumers

`PAGE_VERBS` in `packages/cli/src/page.ts` (39 entries, driving both the page and react trees through `leafCommandsFor`) carries only `{targetsElement, flags}` today. It grows `summary` (one concrete line), `examples`, `category`, and optional `keywords` for synonyms ("type" → fill, "press" → click). `server.ts`'s hand-written subcommands get the same fields.

That table feeds exactly four consumers:

1. **`--help` for humans** — citty `meta.description` reads `summary` instead of the generated template.
2. **`conciv.catalog` inside the code sandbox** — the machine-readable catalog agents filter (section 2).
3. **The typed per-verb facade** for code mode (section 3).
4. **The skill file** init installs (section 5).

A verb cannot be discoverable without being invocable, and help cannot disagree with the catalog.

### 2. Discovery is code-only

There is **no** `search` command and **no** `describe` command. An agent discovers capabilities the way Cloudflare's search-and-execute pattern does — by writing code against the catalog, which never leaves the sandbox:

```js
// which verbs deal with class names?
return Object.entries(conciv.catalog.verbs)
  .filter(([, v]) => v.summary.includes('class') || v.keywords?.includes('class'))
  .map(([path, v]) => ({path, summary: v.summary}))
```

```js
// full signature for one verb, nothing else
return conciv.catalog.verbs['page.fill']
```

Consequences, stated plainly:

- **No command ever prints the catalog in full**, so catalog size is irrelevant to context cost — the property that lets this scale.
- The agent needs to know only the _idiom_, not the catalog. That idiom is what the skill teaches (~200 standing tokens) and what `conciv tools code --help` shows.
- Humans keep `--help` with real descriptions. Human discovery and agent discovery are different surfaces fed by the same table; neither is a fallback for the other.

### 3. Execution: `conciv tools code`

- `conciv tools code '<js>'` (also `--file <path>` or stdin) runs model-written JavaScript and prints **one** JSON value.
- Execution uses the `@tanstack/ai-isolate-node` driver we already ship, for timeouts and cancellation.

**Types come from oRPC, not a generator.** `packages/contract/src/client.ts` defines `RpcClient = ContractRouterClient<typeof contract>`; the whole API is end-to-end typed from one zod contract and the package ships its `.d.ts`. The script receives that real typed client, so the contract is the enforcement. Two thin additions:

- **Per-verb narrowing** is the only thing the verb table still supplies. `page.run` takes `PageRunInputSchema` = `{verb, selector?, ref?, value?, …}` — one loose union, so `rpc.page.run({verb: 'click', value: 'x'})` type-checks while being nonsense. The `conciv.page.click(target)` facade narrows per verb from the table's `flags`; field types come free from zod.
- **`conciv tools types`** emits the facade's `.d.ts` (derived, never hand-written) for on-demand reading or a human's editor.

**OpenAPI is deliberately not used.** `@orpc/openapi` is not installed and is not needed: OpenAPI is a serialization format for cross-language consumers, while ours is a JavaScript script running in-process where the contract's TypeScript types are strictly better — no conversion, no drift. It would only earn its place with non-JS clients.

**On sandboxing, honestly:** Cloudflare needs the Dynamic Worker isolate because the model's code runs inside _their_ service with credentials in scope. At our CLI boundary the caller already has full shell on this machine, so the isolate buys resource control (timeout, cancellation, one clean result), **not** a trust boundary — we say so rather than implying safety we do not provide. The in-chat path is the opposite case: there conciv _is_ the host running model code, which is why it already isolates for real.

### 3a. Direct verb commands stay — for execution only

Discovery is code-only (section 2). **Execution** keeps both interfaces, which is Cloudflare's own documented guidance: direct calls when "the task is simple and uses a small, known tool set", code when it "needs composition, dependent calls, filtering, branching".

- one-shot action ⇒ `conciv tools page click --ref e12`
- composition, filtering, looping ⇒ `conciv tools code '…'`

Their MCP surfaces collapse to a single `code` tool because an MCP client must preload every tool schema; a CLI never pays that cost, since an agent pays only for the command it runs. Forcing code for a single click would make the simple case worse.

### 3b. Snippets: successful programs become reusable

- `conciv tools code '…' --save <name>` stores the script under `.conciv/snippets/<name>.js` after a **successful** run only.
- `conciv tools snippets` lists saved names with their descriptions (`--json` for agents).
- `conciv tools code --run <name>` re-executes a saved snippet; `--args '<json>'` arrives as a `params` binding.
- Snippets are project-local and git-visible under `.conciv/`, so a team inherits them like any checked-in tooling and a human can read what an agent saved.

The loop the skill teaches: filter the catalog → write code → save it if it worked → re-run it by name next time.

### 4. Error contract

Two classes, mirroring wrangler:

- **User error** — the caller can fix it. One actionable line, no stack (stack behind a debug flag), exit 1. Connection failure becomes: `No conciv dev server on 127.0.0.1:5173. Start your app (pnpm dev), or point conciv at it with CONCIV_PORT=<port>.`
- **Unexpected** — message + stack + "this looks like a bug", exit 1.

Domain errors are already declared in the contract (`page.run` carries `.errors({NO_PAGE_CLIENT: {message: 'no widget connected'}, PAGE_TIMEOUT: …})`), so user-error text derives from those declarations instead of being invented per call site. Applies to `init` too — preflight refusals are user errors by definition. Under `--json`, errors are JSON; never a stack on stdout.

### 5. Skills as the standing entry point

`init` installs a conciv skill per consented harness (wrangler's pattern; we already detect harnesses and own claude's plugin path). ~15 lines: what conciv is, the catalog-filter idiom, `code` for real work, direct verbs for one-shots, snippets, the dev-server requirement, two worked examples. The marked AGENTS.md section shrinks to a pointer for harnesses without a skills convention — it stops being a mini-catalog. Standing cost ~200 tokens, flat forever.

### 6. Output envelope

`{ok: true, data}` / `{ok: false, error: {kind: 'user' | 'unexpected', message, hint?}}` for verbs and `code`; for `init`, the ledger it already builds (`{ok, steps: [{id, title, status, detail?, cards}], next}`). Under `--json` all human decoration (clack frames, colors, spinners) is suppressed and stdout is exactly one JSON document. Exit codes keep their meaning — 0 for a run that completed with manual steps, per the init spec's decision 7 — which makes `--json` the documented way to detect partial success.

### 7. Did-you-mean

An unknown verb or flag prints the closest known name (Levenshtein over the table) before the help.

## Migration (expand → migrate → contract; CI green at every step)

1. **Expand** — add the optional `summary`/`examples`/`category`/`keywords` fields, the error classes, the envelope, and the shared non-interactive helper alongside what exists. Nothing breaks; generated descriptions still render.
2. **Migrate, one surface per batch** — page verbs, then react, then server, then init: fill the table fields, switch that surface to the factory, convert failures to user errors, add `--json`. Each batch independently green.
3. **Code mode** — `conciv tools code` + `types`: the typed oRPC client plus the per-verb narrowing facade on the node isolate driver.
4. **Catalog binding** — expose `conciv.catalog` in the sandbox; this is the discovery surface (no search/describe commands are ever added).
5. **Snippets** — `--save`, `snippets`, `--run <name>` under `.conciv/snippets/`.
6. **Skills** — init installs them, teaching filter → code → save → re-run; the AGENTS.md section shrinks.
7. **Contract** — delete the generated-description path and the raw-error escape; add the registry guard test.

## Testing

- **Registry guard**: walk every registered command; assert `summary` exists, is not equal to its own path, and every declared flag has a `describe`. This is what makes the original bug unrepeatable.
- **Catalog discovery**: a filter script over `conciv.catalog` returns only the matched subset; a second test asserts no command prints the catalog in full (the property the whole design rests on).
- **Code mode**: a script calling two bindings returns one JSON value; a thrown script surfaces as a user error, not a stack; the timeout fires; the per-verb facade rejects a flag the verb does not accept (the narrowing the loose union cannot express).
- **Snippets**: a successful `--save` writes the file, a failing run does not; `--run <name>` re-executes; `--args` reaches `params`; `snippets --json` lists what is stored.
- **Errors**: connection failure renders the user-error text with no stack and exit 1; an unexpected throw takes the bug path; contract-declared errors surface with their declared messages.
- **Non-TTY**: every prompting command exits 1 with the instruction rather than hanging.
- **Skill install**: files land in the right per-harness location; re-run is idempotent.

## Out of scope

- Telemetry/Sentry — wrangler has the infrastructure; we do not, and this spec does not add it.
- `status`/`owner` metadata — valuable for a large public API surface, not for us yet.
- Renaming or removing any verb: this is a discovery, composition, and error contract, not an API change.
- MCP-side code mode over `/api/mcp`: the in-chat path already covers the LLM inside conciv; wrapping our MCP server in a single `code` tool is a separate question.
