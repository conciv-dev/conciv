# conciv CLI command contract — code-mode discovery, typed execution, honest errors

Status: DESIGN COMPLETE — mechanism decisions closed 2026-08-04 (sections 3, 3b, 5 rewritten against the real library surface). Scope: `conciv tools …` (every verb) plus `conciv init`, as consumed by AI agents first and humans second.

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
- No dev server ⇒ `TypeError: fetch failed` plus four lines of undici stack (`runRpc` rethrows anything that is not an `ORPCError`, so it surfaces unhandled). Exit code 1 is correct, but nothing names the cause, the port, or the fix.
- **Domain errors are silently downgraded to success.** `request.ts:runRpc` catches `ORPCError`, prints `{"message": …}` on stdout, and sets no exit code — so `conciv tools page click --ref nope` exits **0** with an error payload a script cannot distinguish from a result. This is the concrete form of "doesn't swallow stuff": today it swallows, and the contract's own declared errors (`NO_PAGE_CLIENT`, `PAGE_TIMEOUT`) arrive as exit-0 text.
- Verb results are already JSON (`runRpc` writes `JSON.stringify(result)`); missing are a stable envelope and a JSON error shape. `init` has no JSON mode.
- An unknown verb prints the parent help with no suggestion.
- **The verb table has already drifted from the protocol, silently.** `PAGE_VERBS.effect` declares an `effect` flag, but `FIELD` has no `effect` entry and `allowedFields` filters out any name it does not know — so citty accepts `--effect foo` and the RPC is sent without it. `FIELD.action` allows three values where `PageQuerySchema` allows seven (`enable`, `disable`, `toggle`, `list` are rejected), and the `ext` verb's `extension`/`verb`/`argsJson` fields have no CLI representation at all. Two parallel descriptions of the same input, with the divergence swallowed rather than failing to compile — which is the structural reason the catalog cannot be built from `flags` + `FIELD`.

## What the references actually do (source-read 2026-08-04)

**wrangler** (cloudflare/workers-sdk): a `createCommand`/`createNamespace` factory whose type requires `metadata: {description, status, owner, category?, examples?, epilogue?}`; `describe` on every arg; `positionalArgs` declared; a `behaviour` block so commands "only diverge intentionally"; handler context carrying `{logger, confirm, prompt, isNonInteractiveOrCI, errors: {UserError, FatalError}}`; `UserError` prints its message with the stack at debug only and no bug-blame, everything else gets stack + "may be a bug" + telemetry; `logDidYouMean` on typos. Their CLI has no agent-facing search — `wrangler docs <terms>` searches only to open a browser — and their agent story is skills installed to disk (`agents-skills-install.ts`, `detect-agent.ts`).

**Cloudflare Code Mode** (`/agents/tools/codemode/`, `/agents/model-context-protocol/codemode/`): two patterns — a single `code` tool carrying typed methods for every upstream tool, or `search` + `execute` for large APIs. Crucially **their search is code, not a query**: the model writes `const spec = await codemode.spec(); return Object.entries(spec.paths).filter(…)`, the complete document stays inside the sandbox, and only the filtered subset enters context. Their `/agents/concepts/tools/` page presents direct tool calls and Code Mode as a choice of _interface_ — direct "when the task is simple and uses a small, known tool set", Code Mode "when the task needs composition, dependent calls, filtering, branching, repeatable logic, or tool discovery". Successful programs can be saved as reusable snippets.

**Us**: `@tanstack/ai-code-mode` (installed, in use) exports `createCodeMode`, `createCodeModeTool`, `createDiscoveryTool`, `toolToBinding`/`toolsToBindings`, `generateTypeStubs`, `jsonSchemaToTypeScript`, `stripTypeScript`, `wrapCode`; `@tanstack/ai-isolate-node` provides the driver. `packages/contract` already exports `RpcClient = ContractRouterClient<typeof contract>` — the whole API typed from one zod contract. Nothing new to install.

## Design

### 1. One catalog, four consumers

**The catalog is a registry of every leaf command, not of page verbs.** `PAGE_VERBS` (39 entries, driving the page and react trees through `leafCommandsFor`) covers only `page.run` verbs; the tree also has `page changes`, seven `server` operations, and `open`. A catalog that misses those is a catalog an agent cannot trust, so the registry is one typed list of leaf commands with `PAGE_VERBS` as one section of it, and the guard test asserts coverage **both ways** — every registered command appears in the registry, and every registry entry resolves to a registered command.

Each entry carries `summary` (one concrete line), `examples`, `category`, optional `keywords` for synonyms ("type" → fill, "press" → click), and — critically — **its input as a real zod schema, not a flag-name list**.

Per-verb schemas replace `flags` + `FIELD`. That pair is what drifted (see the baseline): two descriptions of one input, with unknown names filtered out instead of failing to compile. One schema per verb, narrowed from `PageQuerySchema`, becomes the single source for the citty args, the catalog signature, the typed facade, and validation — so a field that exists in the protocol and not in the CLI is a type error rather than a silently dropped argument. Requiredness and the target rules (`selector` vs `ref` vs `name` are alternatives, not three optionals) live in that schema too, because they are exactly what the loose union cannot express.

That registry feeds exactly four consumers:

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

- `conciv tools code '<js>'` runs agent-written JavaScript and prints **one** JSON envelope.
- The script body is an ES module body: top-level `await` and `return` both work, `import` does not (the body is wrapped, not evaluated as a module of its own).
- **Exactly one source**, or it is a user error: the positional argument, `--file <path>`, `--run <name>`, or piped stdin. stdin is read only when it is not a TTY, so an interactive `conciv tools code` with no source prints usage and exits 1 instead of hanging on a read.

**Mechanism: a child `node` process, not `isolated-vm`.** This is a correction to the obvious guess, made after reading the library surface:

- `IsolateConfig.bindings` (`@tanstack/ai-code-mode`) is a flat `Record<string, ToolBinding>` where each binding is a JSON-schema'd single-argument `execute`. A live oRPC proxy cannot cross that boundary. A nested facade is not _impossible_ — generated sandbox JavaScript could wrap flat bindings — but it would be re-derived from JSON Schema inside the sandbox instead of using the contract's own types. The honest objection is duplication and worse types, not impossibility, and the spec says so rather than overclaiming.
- `isolated-vm` is an optional native addon. `probeIsolatedVm()` can legitimately report incompatible, which is why the in-chat path returns `null` and degrades to direct tools. A CLI command cannot degrade to nothing — `conciv tools code` must work on every machine that can run the CLI. This, not impossibility, is what decides it.

**Three packaging rules the child mechanism lives or dies by:**

1. **The runner ships inside the CLI's own `dist`; the agent's code never becomes a module of its own.** ESM bare-specifier resolution starts at the importing file's directory, so a temp file under the OS temp dir importing `@conciv/contract` fails with `ERR_MODULE_NOT_FOUND` even when the CLI is correctly installed — and a temp `.js` inherits the nearest `package.json` type and may be parsed as CJS. The parent spawns the shipped runner by absolute path and hands the body over as data (stdin or an argument), so every import resolves from inside the installed package. This is the difference between working in this monorepo and working in a consumer project.
2. **The result does not travel on stdout.** The agent's code can `console.log`, and debugging code especially will — which would put two documents where the contract promises one. The child returns its value over a dedicated channel (IPC or a non-stdout descriptor); captured stdout and stderr become fields of the envelope, and only the parent ever writes the final JSON document.
3. **`RpcClient` is plain HTTP against an origin**, so the child rebuilds the client itself from `CONCIV_PORT` — nothing live needs transferring.

What the child buys, stated plainly: a real timeout (kill the child), real cancellation, and crash isolation. What it does not buy is a trust boundary — the caller already has a shell on this machine — and we say so instead of implying safety we do not provide. Cloudflare needs a Dynamic Worker isolate because the model's code runs inside _their_ service with credentials in scope; the in-chat path is that same case, which is why it isolates for real. Our CLI is not. And neither wrangler nor Code Mode validates our packaging, typechecking, or persistence choices — those need local tests, not borrowed authority.

**Types come from oRPC, not a generator.** `packages/contract/src/client.ts` defines `RpcClient = ContractRouterClient<typeof contract>`; the whole API is end-to-end typed from one zod contract and the package ships its `.d.ts`. Because the child is a real module, it `import`s the real client — the contract is the enforcement, with no schema round-trip. Two thin additions:

- **Per-verb narrowing** is the only thing the registry still supplies, and it comes from the per-verb zod schema (section 1), not from a flag-name list. `page.run` takes `PageRunInputSchema` = `{verb, selector?, ref?, value?, …}` — one loose union where every field is optional, so `rpc.page.run({verb: 'click', value: 'x'})` and `fill({ref: 'e1'})` with no value both type-check while being nonsense. The facade narrows per verb: allowed fields, **required** fields, and the target alternatives.
- **`conciv tools types`** emits an importable typed module (plus its declarations) rather than a loose ambient `.d.ts`. An unrelated `.d.ts` sitting in a directory is not loaded into anybody's TypeScript program, so a file that merely exists would be decorative. A `--file script.ts` gets its types by importing the emitted module; if `--file` is to promise checking rather than only stripping, the runner invokes the compiler with a named config — stripping catches syntax, never a wrong argument. Which of those two `--file` promises we make is settled in the implementing ticket, with the honest version documented either way.

**OpenAPI is deliberately not used.** `@orpc/openapi` is not installed and is not needed: OpenAPI is a serialization format for cross-language consumers, while ours is a JavaScript script importing the same package where the contract's TypeScript types are strictly better — no conversion, no drift. It would only earn its place with non-JS clients.

**Discovery works with no dev server.** `conciv.catalog` is static data compiled from the registry at build time; filtering it makes no RPC call. Only executing a verb needs the running app. So an agent's first move — "what can conciv do about class names?" — never fails with a connection error, which is what makes the skill's opening instruction safe.

The catalog carries a **JSON-safe signature per command** — field names, types, enum values, requiredness, target rules — compiled from the per-verb schemas during the CLI build. That is what makes `return conciv.catalog.verbs['page.fill']` worth reading; a name and a summary alone would not be a signature, and claiming otherwise while shipping `{targetsElement, flags}` would be a lie in the one surface agents rely on.

### 3a. Direct verb commands stay — for execution only

Discovery is code-only (section 2). **Execution** keeps both interfaces, which is Cloudflare's own documented guidance: direct calls when "the task is simple and uses a small, known tool set", code when it "needs composition, dependent calls, filtering, branching".

- one-shot action ⇒ `conciv tools page click --ref e12`
- composition, filtering, looping ⇒ `conciv tools code '…'`

Their MCP surfaces collapse to a single `code` tool because an MCP client must preload every tool schema; a CLI never pays that cost, since an agent pays only for the command it runs. Forcing code for a single click would make the simple case worse.

### 3b. Snippets: successful programs become reusable

- `conciv tools code '…' --save <name>` stores the script after a **successful** run only.
- **They do not live under `.conciv/`.** Our own vite plugin writes runtime state there and the root `.gitignore` ignores the whole directory — and a nested `.gitignore` cannot re-include a file whose parent directory is excluded, so "git-visible snippets under `.conciv/`" was simply false. Team artifacts (snippets and the installed skill) go in a tracked `conciv/` directory; `.conciv/` stays ignored runtime state. Two directories is the price of the claim being true.
- `--describe <text>` (optional, only meaningful with `--save`) records what the snippet is for. Metadata lives beside each snippet, per snippet — not in one shared index that two concurrent saves can clobber and a crash between two writes can desync. A snippet saved without `--describe` lists `description: null` rather than a guess.
- Names are restricted to a portable slug (no separators, no traversal, no case-collisions), and saving over an existing name is refused unless `--force`. A path like `../../x` is a user error, not a write.
- `conciv tools snippets` lists what is stored (`--json` for agents).
- `conciv tools code --run <name>` re-executes a saved snippet; `--args '<json>'` arrives as a `params` binding.
- Snippets are project-local and readable, so a team inherits them like any checked-in tooling and a human can read what an agent saved.

The loop the skill teaches: filter the catalog → write code → save it if it worked → re-run it by name next time.

### 4. Error contract

Two classes, mirroring wrangler:

- **User error** — the caller can fix it. One actionable line, no stack (stack behind a debug flag), exit 1. Connection failure becomes: `No conciv dev server on 127.0.0.1:5173. Start your app (pnpm dev), or point conciv at it with CONCIV_PORT=<port>.`
- **Unexpected** — message + stack + "this looks like a bug", exit 1.

**How a user error is recognised at runtime.** Not by importing the contract's declarations: TypeScript does not type thrown values, and `RpcClient` exposes no runtime error catalog. What the client actually receives is an `ORPCError` carrying `defined`, `code`, `status`, `message`, and `data` — and `defined === true` means precisely "this is an error the contract declared". So: `defined` errors are user errors, reported with their `code` and the server's message (which the contract's `.errors({NO_PAGE_CLIENT: …, PAGE_TIMEOUT: …})` declarations are the source of, server-side). Transport failures and the CLI's own validation are mapped locally, by hand, because nobody declared them. Everything else is the bug path. Applies to `init` too — preflight refusals are user errors by definition. Under `--json`, errors are JSON; never a stack on stdout.

### 5. Skills as the standing entry point

`init` installs a conciv skill: ~15 lines covering what conciv is, the catalog-filter idiom, `code` for real work, direct verbs for one-shots, snippets, the dev-server requirement, and two worked examples. Standing cost ~200 tokens, flat forever regardless of catalog size.

**Where it lands, per harness, without inventing paths.** We detect four harnesses (`claude`, `codex`, `opencode`, `pi` — `harness-detect.ts`). Only claude has a skills location we already own and write to: the connect plugin we generate under `.conciv/`, so the skill ships as a file inside it. For the other three we have not verified a skills convention, so we do not guess one: the skill is written once to `conciv/skill.md` — the tracked directory, alongside snippets, for the same reason `.conciv/` cannot hold it (gitignored) — and the marked AGENTS.md section becomes a pointer to it. Adding a real per-harness path later is a one-line addition to the same step, and is out of scope here.

Either way the AGENTS.md section stops being a mini-catalog — it names conciv, the dev-server requirement, and where the skill is. It no longer lists verbs, because listing verbs in a standing file is exactly the context cost this design removes.

### 6. Output envelope

`{ok: true, data}` / `{ok: false, error: {kind: 'user' | 'unexpected', message, hint?}}` for verbs and `code`; for `init`, the ledger it already builds (`{ok, steps: [{id, title, status, detail?, cards}], next}`). Under `--json` all human decoration (clack frames, colors, spinners) is suppressed and stdout is exactly one JSON document. `code` and `snippets --json` are agent-only surfaces and always emit the envelope, so `--json` there is accepted and inert rather than a second mode.

For `init`, `--json` is not a serialization step bolted on at the end: the pipeline emits incrementally through spinners and output callbacks, so a run that only stringifies the ledger last would still have leaked clack frames on the way. It is a **silent implementation of the existing `InitOutput` seam**, selected before the first `intro`, collecting what the human surface would have drawn. And interactivity is decided from both relevant streams, not stdout alone — today a redirected stdout with an interactive stdin is misclassified as non-interactive. A failing envelope always pairs with exit 1 — the exit-0 error payload in the baseline is the bug this closes. Exit codes otherwise keep their meaning — 0 for a run that completed with manual steps, per the init spec's decision 7 — which makes `--json` the documented way to detect partial success.

### 7. Did-you-mean

An unknown verb or flag prints the closest known name (Levenshtein over the table) before the help.

## Migration (expand → migrate → contract; CI green at every step)

1. **Expand** — add the optional registry fields, the error classes, the envelope, and the shared non-interactive helper alongside what exists. Nothing breaks; generated descriptions still render.
2. **Migrate, one surface per batch** — page verbs, then react, then server (and `open`, and `page changes`), then init: give each leaf its per-verb schema, fill the registry fields, convert failures to user errors, add `--json`. Each batch independently green; the drifted `effect`/`action`/`ext` fields are fixed by the schema, not patched by hand.
3. **Code mode** — `conciv tools code` + `types`: the shipped runner, the typed oRPC client, and the per-verb narrowing facade.
4. **Catalog binding** — expose `conciv.catalog` (with compiled signatures) in the sandbox; this is the discovery surface (no search/describe commands are ever added).
5. **Snippets** — `--save`, `snippets`, `--run <name>` in the tracked `conciv/` directory.
6. **Skills** — init installs them, teaching filter → code → save → re-run; the AGENTS.md section shrinks.
7. **Contract** — delete the generated-description path and the raw-error escape; add the registry guard test.

## Testing

- **Registry guard, both directions**: walk every registered command and assert `summary` exists, is not equal to its own path, and every declared flag has a `describe`; then walk the registry and assert every entry resolves to a registered command. One direction alone lets `open` or `page changes` fall out of the catalog while help still looks fine.
- **Schema/protocol agreement**: a verb's schema accepts exactly the fields the protocol accepts for it — the regression test for the swallowed `--effect`, the four missing `action` values, and the unrepresented `ext` fields.
- **Consumer install**: `conciv tools code` runs from a project that installed the CLI from a packed tarball, not only from inside this monorepo — the failure mode is module resolution, so the monorepo cannot detect it.
- **Stdout is not the channel**: a script that `console.log`s still yields exactly one JSON document on stdout, with the logs inside the envelope.
- **Catalog discovery**: a filter script over `conciv.catalog` returns only the matched subset; it still works with **no dev server running**; and no command prints the catalog in full (the property the whole design rests on).
- **Code mode**: a script calling two bindings returns one JSON value; a thrown script surfaces as a user error, not a stack; the timeout kills the child and reports it as a user error; the per-verb facade rejects a flag the verb does not accept (the narrowing the loose union cannot express).
- **Exit codes**: a contract-declared domain error (`NO_PAGE_CLIENT`) exits 1 with `{ok: false}` — the regression test for today's exit-0 swallow.
- **Snippets**: a successful `--save` writes the file, a failing run does not; `--run <name>` re-executes; `--args` reaches `params`; `snippets --json` lists what is stored; a traversal name and a duplicate name are refused; a saved snippet is visible to plain `git status` (the claim `.conciv/` could not support).
- **Errors**: connection failure renders the user-error text with no stack and exit 1; an unexpected throw takes the bug path; a `defined` oRPC error surfaces with its code and declared message.
- **Non-TTY**: every prompting command exits 1 with the instruction rather than hanging, and `conciv tools code` with no source on a TTY prints usage instead of blocking on a stdin read.
- **Source precedence**: supplying two of positional / `--file` / `--run` / piped stdin is a user error, not a silent winner.
- **Skill install**: files land in the right per-harness location; re-run is idempotent.

## Out of scope

- Telemetry/Sentry — wrangler has the infrastructure; we do not, and this spec does not add it.
- `status`/`owner` metadata — valuable for a large public API surface, not for us yet.
- Renaming or removing any verb: this is a discovery, composition, and error contract, not an API change.
- MCP-side code mode over `/api/mcp`: the in-chat path already covers the LLM inside conciv; wrapping our MCP server in a single `code` tool is a separate question.
