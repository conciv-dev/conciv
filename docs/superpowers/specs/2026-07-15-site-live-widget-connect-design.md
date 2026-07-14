# Live widget on conciv.dev: connect your own agent (issue #58, track B)

Design for the first live-widget experience on the public site: a visitor connects the agent CLI
already on their machine (Claude Code first) to conciv.dev, and the conciv widget appears on the
landing page, driving the page with their agent behind it.

Status: designed, spiked, not implemented. Companion track A (fully in-browser agent) is parked —
see "Track A: parked" below.

## Goals

- A visitor with Claude Code (or codex/gemini-cli/opencode/pi) tries the real product on
  conciv.dev in under a minute, with zero infrastructure cost or abuse surface for us.
- The widget demonstrates itself on the page visitors already see: grab an element on the landing
  page, chat about it, let the agent restyle or drive it.
- All agent traffic stays on the visitor's machine. We serve static assets only.

## Non-goals (this iteration)

- Relay transport for cross-machine use (stage 2, designed-for below, not built).
- Track A in-browser agent (parked behind a model bake-off).
- Mobile (no local agent to connect), abuse controls (nothing live is ours), replayed/scripted
  demo sessions.

## Spike evidence (2026-07-13)

Spike B (this design) passed end to end:

- The prebuilt widget global bundle on one origin completes chat turns + SSE against a core on
  another origin. Widget already supports a remote core via `pw-api-base` meta /
  `window.__CONCIV_API_BASE__` / `?core=` (`apps/conciv/src/lib/api-base.ts`).
- Core CORS already enforces an origin allowlist (`packages/core/src/lib/cors.ts`): loopback
  origins auto-allowed, others only via `allowedOrigins`.
- The one prod-only gate: Chrome's Local Network Access permission (public https origin →
  loopback). Reproduced locally with `--ip-address-space-overrides` + a self-signed https host:
  permission denied → every request blocked; permission granted → full chat turn, zero failures.
  The legacy `Access-Control-Allow-Private-Network` preflight header is irrelevant (superseded by
  the permission). Firefox/Safari do not enforce LNA today and work without any prompt.
- Core boots standalone via `start()` (`packages/core/src/start.ts`) with the real claude harness
  in ~20 lines — the connector command is small.

## Visitor journey

1. Landing page shows "● Try it live — connect your agent". Click opens a connect panel; the page
   mints a session token (`crypto.randomUUID`, held in page memory).
2. Panel, two tabs:
   - Claude Code (primary): copy button for
     `Read https://conciv.dev/pair/<token> and follow the instructions`.
     The pair URL serves agent-readable plain text: run
     `npx @conciv/cli connect --token <token>` (bin name is `conciv`), keep it running, tell the
     user to return to the browser tab.
   - Terminal: the raw `npx @conciv/cli connect --token <token>`.

   Note: `@conciv/cli`'s npm description currently says "internal, do not install directly" —
   connect makes it visitor-facing; update the description (and consider claiming the bare
   `conciv` npm name for a nicer `npx conciv connect`).

3. The page polls `http://127.0.0.1:4732`–`4741` `/t/<token>/health` (quiet backoff). The token
   rides as a path prefix — the widget's rpc client takes only a base URL, so a prefix (stripped by
   a Hono `.mount`) authenticates every request with zero widget changes; wrong prefix = 404.
4. The connector (on the visitor's machine) starts core on the first free port in that range:
   claude harness by default (`--harness codex|gemini-cli|opencode|pi` supported), a throwaway
   temp workspace, `allowedOrigins: ['https://conciv.dev']`, token required on every request.
5. First successful poll triggers Chrome's one-time "local network access" permission prompt. The
   panel pre-explains it ("Chrome will ask to allow local network access — that's your agent
   connecting"). Firefox/Safari skip this.
6. Connected: panel collapses, the widget FAB mounts (global bundle loaded on demand,
   `pw-api-base` set to the discovered port), status chip shows
   "connected to <harness> on your machine". The agent drives the landing page via page tools.

## Architecture (prod)

```
Cloudflare Worker (conciv.dev)          static only: landing HTML, /pair/<token> text,
                                        conciv-widget.global.js asset. No state, no sockets,
                                        no visitor traffic, no cost exposure.
        │ page load
        ▼
visitor's browser                       mints token; polls loopback; loads widget bundle;
                                        talks fetch/SSE directly to 127.0.0.1:<port>
        ▼ (machine-local traffic only)
visitor's machine                       `npx conciv connect` → core (loopback bind, temp
                                        workspace, CORS+token) → spawns their agent CLI per
                                        turn (their login/subscription)
```

Privacy consequence worth stating in the panel UI: prompts, code, and page snapshots never touch
our servers.

## Components

| Piece                                 | Where           | Notes                                                                                                                                                        |
| ------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connect` subcommand                  | `packages/cli`  | `start()` + claude harness default, `--harness`, `--token`, temp workspace (`--workspace .` opt-in), port range 4732–4741, prints status + shutdown hint     |
| Token gate                            | `packages/core` | `accessToken` start opt: app served under `/t/<token>` via Hono `.mount` (prefix stripped); anything else 404s                                               |
| `/pair/<token>` route                 | `apps/site`     | stateless: interpolates the token from the URL into plain-text instructions                                                                                  |
| Connect panel + poller + widget mount | `apps/site`     | the main UI work; widget global bundle shipped as a site static asset (copied from `packages/embed/dist` at site build — lockstep versions, no external CDN) |

Prod-embed decision (answers the RFC's bundle question): the site loads the global IIFE bundle on
demand after connect. The `@conciv/it` vite plugin stays dev-only.

## Lifecycle and errors

- Waiting: poller idles with backoff; panel shows "waiting for your agent…".
- LNA denied: requests fail — after a timeout, Chrome-specific help text (re-enable in site
  settings).
- Connector killed / sleep: SSE drops → widget disconnected state → page resumes polling → same
  token reconnects seamlessly.
- No agent CLI installed: connector exits with install pointer per harness.
- Port range occupied: connector reports; page poll covers the whole range.

## Security

- Core binds `127.0.0.1` only. CORS allowlist is exactly `https://conciv.dev`. Token required on
  every request; it travels only via the visitor's clipboard.
- Throwaway workspace by default — the site widget can never read the repo Claude Code happened to
  be launched from. Explicit `--workspace .` to opt in.
- Existing permission-gate policy unchanged: risky Bash still asks (in the widget UI).
- We never proxy or store visitor traffic in stage 1.

## Testing

- Core: token-middleware unit tests + CORS IT (extend `packages/core/test/api/cors.it.test.ts`).
- CLI: `connect` IT against the fake harness — boots, health+token respond, temp workspace used
  (pattern: `packages/cli/test/cli.it.test.ts`).
- E2E (promote the spike): prod site build + connector + Chromium
  `--ip-address-space-overrides` + granted `local-network-access` permission → chat turn + a
  `setstyle` page mutation. Fake harness in CI; real claude locally.
- Pair-page copy check: real claude (locally) can follow `/pair/<token>` unaided.

## Stage 2: relay (designed-for, not built)

A Durable Object per token on the existing CF deployment; both sides dial out over wss and the DO
pipes frames. Buys: no LNA prompt, browser and agent on different machines, immunity to future
browser tightening of public→loopback. Costs: we carry (but don't store) visitor traffic; abuse
surface; DO code. v1 stays compatible: the token already identifies the session on both ends, and
the widget already selects transport via `pw-api-base` — stage 2 is "poll fails (or `?relay=1`) →
apiBase = relay URL" plus the DO.

## Track A: parked (in-browser agent, no install)

Spike A proved the runtime end to end: core (Hono/oRPC/SSE) + sqlite-wasm (drizzle migrations) +
the unmodified widget bundle + a transformers.js harness all run inside a browser tab, including
the full agentic loop (tool call → core executes → result → next turn). Blocked on model quality,
not plumbing: Qwen3-0.6B forms valid tool-call JSON (with thinking mode) but picks wrong tools;
larger candidates were untestable during a HuggingFace LFS outage; q4-on-WebGPU without a q4f16
build produces numeric garbage; one onnxruntime WebGPU session crash observed (`OrtRun` /
"Invalid buffer") — needs a retry/recreate guard.

Revival checklist (in order): fix the spike's system-prompt wiring (`makeApp` likely wants
`systemPromptText`, `cfg.systemPrompt` appeared ignored); bake off 1.7B-class models
(Qwen3-1.7B / LFM2 / Qwen2.5-1.5B with q4f16) with thinking enabled; if pass — production shape is
a harness-registry split (browser entry registers only the local-LLM harness so no CLI SDKs are
bundled), core + inference in a worker (Service Worker rpc bridge, SharedWorker weight dedupe),
and the ~5 node-shims done properly.

## Considered and rejected

- Hosted backend with a live model on our infra: cost + sandboxing + abuse — the RFC's own
  concern; unnecessary given track B.
- WebContainers for v1: real production precedent (svelte.dev tutorial) and zero core changes,
  but COOP/COEP on the site, weak Safari/mobile, commercial licensing, multi-MB boot, and no clear
  `node:sqlite`/CLI-spawn path. Right tool later IF we want the full agent-edits-files demo
  in-browser; wrong cost for the page-only demo.
- Claude Code CLI in-browser (node-in-wasm) with a local model behind `ANTHROPIC_BASE_URL`:
  runtime is plausible, economics aren't — it keeps claude-code's machinery costs (boot weight,
  ~10k-token system prompt → tens of seconds of in-browser prefill per turn, 15-tool surface that
  small models fail) while discarding its sole irreplaceable ingredient, Claude itself. Our core
  already provides the loop at ~1/20th the weight.

## Open questions

- Exact port range and whether to also try a `?core=` override for power users (probably yes,
  trivial).
- Pair-page wording that reliably steers agent CLIs other than claude (codex/gemini) — validate
  when those harnesses get first-class connect docs.
- Whether the landing page needs a "restore page" reset after the agent restyles it (likely a
  simple reload hint chip).
