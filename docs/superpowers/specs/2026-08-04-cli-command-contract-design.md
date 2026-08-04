# conciv CLI command contract — discovery, code mode, and honest errors

Status: DRAFT — awaiting user approval. Scope: `conciv tools …` (every verb) plus `conciv init`, as consumed by AI agents first and humans second.

User rulings: "we need our CLI to work like wrangler CLI when it comes to all the tools and verbs" · "make sure this CLI works good for agents and doesn't swallow stuff" · "the agent must have a way to run code and load the relevant skills on demand" · "don't we want the command to generate code using codemode like they are doing?"

## The asymmetry this fixes

conciv's **in-chat** agent already has the modern setup: every extension tool is registered `lazy: true` (`packages/core/src/chat/runtime.ts:53,67`) and `packages/core/src/chat/code-mode.ts` builds a real code-mode surface with `createCodeMode` from `@tanstack/ai-code-mode`, per the implemented plan `docs/superpowers/plans/2026-07-19-lazy-discovery-code-mode.md` ("shrinking conciv's standing system prompt to near zero").

An **external** agent — a terminal claude/codex session shelling out to our CLI — gets none of it: 38 page verbs whose descriptions are their own names, no index, no composition, and a raw undici stack trace when the dev server is down. Same product, two wildly different capabilities. This spec closes that gap using the packages we already ship.

## Measured baseline (against the current build, 2026-08-04)

- `conciv tools page --help` lists 38 verbs described as themselves (`page click` → "page click"). Cause: `packages/cli/src/page.ts` generates `description: \`page ${verb}\``. The AGENTS.md section init writes points agents at exactly this surface.
- No dev server ⇒ `TypeError: fetch failed` + four lines of undici stack. Exit code is correct (1) — failures are not swallowed — but nothing names the cause, the port, or the fix.
- Verb results ARE already JSON (`request.ts:runRpc` writes `JSON.stringify(result)`); what is missing is a stable envelope and a JSON error shape. `init` has no JSON mode.
- Unknown verb prints the parent help with no suggestion.

## What the references actually do (source-read 2026-08-04)

e
**wrangler** (cloudflare/workers-sdk): a `createCommand`/`createNamespace` factory whose type requires `metadata: {description, status, owner, category?, examples?, epilogue?}`; `describe` on every arg; `positionalArgs` declared; a `behaviour` block so commands "only diverge intentionally"; handler context carrying `{logger, confirm, prompt, isNonInteractiveOrCI, errors: {UserError, FatalError}}`; `UserError` prints a message with the stack at debug only and no bug-blame, everything else gets stack + "may be a bug" + telemetry; `logDidYouMean` on typos. Their CLI has **no** search API for agents — `wrangler docs <terms>` searches only to open a browser, and their agent story is skills installed to disk (`agents-skills-install.ts` + `detect-agent.ts`).

**Cloudflare Code Mode** (`@cloudflare/codemode`, `/agents/tools/codemode/`): one `code` tool replaces N tool schemas, so "context window usage stays fixed regardless of how many tools are available"; the model writes JavaScript calling typed `codemode.*` methods; `codemode.search()` / `codemode.describe()` provide on-demand discovery (`?codemode=search_and_execute`); execution happens in a Dynamic Worker isolate to keep credentials out of model context. Their stated payoff beyond context: "Model-written JavaScript can call several tools, process their results, and return one focused value."

**Us**: `@tanstack/ai-code-mode` (installed, in use) exports `createCodeMode`, `createCodeModeTool`, `createDiscoveryTool`, `toolToBinding`/`toolsToBindings`, `generateTypeStubs`, `jsonSchemaToTypeScript`, `stripTypeScript`, `wrapCode`; `@tanstack/ai-isolate-node` provides the driver. Nothing new to install.

## Design

### 1. One catalog, five consumers

`PAGE_VERBS` in `packages/cli/src/page.ts` (39 entries, drives both the page and react trees via `leafCommandsFor`) today carries only `{targetsElement, flags}`. It grows `summary` (one concrete line), `examples`, `category`, and optional `keywords` for synonyms ("type" → fill, "press" → click). `server.ts`'s hand-written subcommands get the same fields.

That one table then feeds: **command registration** (citty `meta.description` reads `summary`, replacing the generated template), **search**, **describe**, **the generated typed API for code mode**, and **the skill file**. A verb cannot be discoverable without being invocable, and help cannot disagree with search.

### 2. Discovery: `search` and `describe`

- `conciv tools search "<query>"` — local scored lookup (exact name > name substring > summary overlap > keyword > example text > category). No embeddings, no network, deterministic. Prints top 5–8 as `page.click  click an element (selector | --ref | --name)` plus a pointer to `describe`.
- `conciv tools describe page.click` — usage line, every flag with its `describe`, examples, and the dev-server note.
- Both take `--json`.

Cost: a lookup is ~80 tokens, a describe ~120, versus a 38-line help wall today; and the cost stays flat as the catalog grows.

### 3. Code mode: `conciv tools code`

The composition half, and the reason this beats N sequential commands:

- `conciv tools code '<js>'` (or `--file <path>`, or stdin) runs model-written JavaScript against a typed `conciv.*` API and prints **one** JSON value.
- Bindings and the API surface come from the verb table through `toolsToBindings` + `generateTypeStubs` — the same package and the same table the in-chat path uses, so the two surfaces cannot drift.
- `conciv tools types` writes the `.d.ts` stub (for the agent to read on demand, or for a human's editor).
- Execution uses the `@tanstack/ai-isolate-node` driver we already ship, for timeouts and cancellation.

Why it matters concretely: "list every button with no accessible label" is one script — snapshot, filter, return three lines — instead of a dozen round-trips whose every intermediate result lands in the agent's context.

**On sandboxing, honestly:** Cloudflare needs the Dynamic Worker isolate because the model's code runs inside _their_ service with credentials in scope. At our CLI boundary the caller is an agent that already has full shell on this machine, so the isolate buys resource control (timeout, cancellation, one clean result), **not** a trust boundary — and we should say so rather than implying safety we do not provide. The in-chat path is the opposite case: there conciv _is_ the host running model code, which is why it already uses the isolate for real isolation.

### 4. Skills as the standing entry point

`init` installs a conciv skill per consented harness (wrangler's `agents-skills-install` pattern; we already detect harnesses and own claude's plugin path). The skill is ~15 lines: what conciv is, the `search → describe → run` loop, `code` for multi-step work, the dev-server requirement, two worked examples. The marked AGENTS.md section shrinks to a pointer for harnesses without a skills convention — it stops being a mini-catalog.

Standing context cost: ~200 tokens, flat forever.

### 5. Error contract

Two classes, mirroring wrangler:

- **User error** — the caller can fix it. One actionable line, no stack (stack behind a debug flag), exit 1. Every connection failure becomes: `No conciv dev server on 127.0.0.1:5173. Start your app (pnpm dev), or point conciv at it with CONCIV_PORT=<port>.`
- **Unexpected** — message + stack + "this looks like a bug", exit 1.

Applies to `init` too (preflight refusals are user errors by definition). Under `--json`, errors are JSON — never a stack on stdout.

### 6. Output envelope

`{ok: true, data}` / `{ok: false, error: {kind: 'user' | 'unexpected', message, hint?}}` for verbs; for `init`, the ledger it already builds (`{ok, steps: [{id, title, status, detail?, cards}], next}`). Under `--json` all human decoration (clack frames, colors, spinners) is suppressed and stdout is exactly one JSON document. Exit codes keep their current meaning — 0 for a run that completed with manual steps, per the init spec's decision 7 — which makes `--json` the documented way to detect partial success.

### 7. Did-you-mean

Unknown verb or flag prints the closest known name (Levenshtein over the table) before the help.

## Migration (expand → migrate → contract; CI green at every step)

The verb tables fan out across every surface at once, so this is sequenced, not sliced:

1. **Expand** — add the optional `summary`/`examples`/`category`/`keywords` fields, the error classes, the envelope, and the shared non-interactive helper beside what exists. Nothing breaks; generated descriptions still render.
2. **Migrate, one surface per batch** — page verbs, then react, then server, then init: fill the table fields, switch that surface to the factory, convert its failures to user errors, add `--json`. Each batch independently green.
3. **Discovery** — `search`, `describe`, did-you-mean (needs the fields from step 2).
4. **Code mode** — `code` + `types` via `toolsToBindings`/`generateTypeStubs` + the node driver.
5. **Skills** — init installs them; AGENTS.md section shrinks.
6. **Contract** — delete the generated-description path and the raw-error escape; add the registry guard test.

## Testing

- **Registry guard**: walk every registered command; assert `summary` exists, is not equal to its own path, every declared flag has a `describe`, and everything `search` can return is invocable. This is what makes the original bug unrepeatable.
- **Discovery**: known queries return the expected verb first; `--json` shape stable; did-you-mean suggests `click` for `clik`.
- **Code mode**: a script calling two bindings returns one JSON value; a thrown script surfaces as a user error, not a stack; the timeout fires.
- **Errors**: connection failure renders the user-error text with no stack and exit 1; an unexpected throw takes the bug path.
- **Non-TTY**: every prompting command exits 1 with the instruction rather than hanging.
- **Skill install**: files land in the right per-harness location; re-run is idempotent.

## Out of scope

- Telemetry/Sentry (wrangler has the infrastructure; we do not, and this spec does not add it).
- `status`/`owner` metadata — valuable for a large public API surface, not for us yet.
- Renaming or removing any verb: this is a discovery, composition, and error contract, not an API change.
- MCP-side code mode (`/api/mcp`): the in-chat path already covers the LLM inside conciv; wrapping our MCP server in a single `code` tool is a separate question.
