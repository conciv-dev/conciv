# Try/connect flow polish — CLI output + guided site panel

Date: 2026-07-17
Status: approved

## Goal

Make the conciv.dev live-connect flow inviting and legible: a branded, stateful CLI
experience in `@conciv/try`, and a guided-steps waiting panel on the site. Tone and
polish modeled on react-grab (action-first copy, one recommended path, clack-style CLI).

## Scope

- `packages/try` — CLI output rebuild with `@clack/prompts` (approved new dependency).
- `packages/core` — new `StartOpts.onClientRequest?: () => void` hook.
- `apps/site` — `TryPanel` rewrite (guided steps, copy/tone), live-transition flash.

Out of scope: the scripted landing demo (`landing/demo/`), seeded workspace content,
npx install-phase noise from npm itself (transitive dep warnings), FAB drag issues.

## 1. CLI (`@conciv/try`)

Target output:

```
┌  conciv — live connect
│
◇  Workspace ready (seeded with conciv.dev landing source)
◇  conciv core running on 127.0.0.1:4732 (harness: claude)
│
◆  Waiting for your browser…
│  Return to conciv.dev — Chrome will ask to allow local
│  network access. Approve it.
│
◇  Browser paired ✓ — the widget is live
│
└  Keep this running. Ctrl+C disconnects.
```

Behavior:

- `@clack/prompts` intro/outro, one spinner per step: seed workspace → start core →
  wait for browser.
- "Browser paired" resolves when core reports the first token-authenticated request
  via the new `onClientRequest` hook.
- Node `ExperimentalWarning` (SQLite) suppressed via the bin shebang
  `#!/usr/bin/env -S node --disable-warning=ExperimentalWarning` (an in-process
  `process.on('warning')` listener cannot suppress node's default stderr print).
  Windows npm shims ignore shebang flags — the one warning line remains there; accepted.
- SIGINT handler: clack outro line ("disconnected"), engine `stop()`, exit 0.
- Non-TTY stdout (agent-driven runs, piped output): fall back to plain line logging —
  same content, no spinners/ANSI. The pair-page flow (agents running the command) must
  still produce greppable "connected" and "paired" lines.
- Structured events over strings: `ConnectOpts.log` is REPLACED by an optional
  `onEvent` callback (`seeded`, `started`, `client-connected`); the CLI maps events to
  clack UI (TTY) or the existing plain strings (non-TTY). v0 break, no other `log`
  consumers exist.

## 2. Core hook

`StartOpts.onClientRequest?: () => void` — invoked on the first request that hits the
token-mounted app (`/t/<accessToken>/...`). Implemented in `start.ts` where the token
mount is built: wrap the mounted fetch, fire once, then no-op. No event emitter, no
per-request cost beyond one boolean check.

## 3. Site panel (`TryPanel`)

Guided numbered steps replacing the flat copy rows:

1. **Copy the agent prompt** — copy row (existing `CopyButton`); step marks done on
   copy click. Collapsed secondary: "or run it yourself" revealing the raw
   `npx @conciv/try --token …` row (copying it also completes step 1).
2. **Run it in your terminal** — hint: "first run installs the package (~30s)". Marks
   done only when connection succeeds (browser cannot observe the terminal).
3. **Approve Chrome's local-network prompt** — informational; the probe fetch itself
   triggers the dialog, and a denied permission is indistinguishable from
   core-not-running, so this step carries the explanatory copy instead of state.
4. **Connected** — on probe success, the widget mounts immediately and the panel shows
   an "Agent connected ✓" success state for ~800ms before hiding.

Copy/tone rewrite (react-grab style): headline "Drive this page with your agent."
Action-first sentences, one recommended path (agent prompt) with the manual command
demoted. Keep: privacy line ("everything stays on your machine…"), 60s slow-hint link,
pulsing waiting indicator, close/dismiss behavior, accessibility labels.

Step state machine (client-only): `copied` (step 1 done), `connected` (steps 2–4
done). No persistence beyond the session; refresh resets to step 1 (probe preflight
already short-circuits straight to live when core is already up).

## Error handling

- CLI: port exhaustion and unknown-harness errors keep citty's default thrown-error
  rendering (same message text as today).
- Panel: no new failure states — polling continues indefinitely; slow-hint at 60s
  unchanged.

## Testing

- `packages/try`: tests for the event sequence (`onEvent` order: seeded → started;
  `client-connected` after a token request) and the plain-line renderer (greppable
  `connected:` line preserved). Warning suppression verified manually (shebang flag).
- `packages/core`: test that `onClientRequest` fires exactly once on token requests.
- `apps/site`: unit tests for the pure `stepStates` model (no component-test infra —
  UI verified by the real-browser e2e). Existing e2e must stay green; the panel-hide
  poll gets headroom for the 800ms flash.
