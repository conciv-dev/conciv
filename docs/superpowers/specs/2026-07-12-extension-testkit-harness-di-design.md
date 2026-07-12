# Extension-testkit harness DI

## Problem

`getExtensionTestApi` boots the real engine via `start()`, but `start()` resolves its harness
only through the registry (`resolveConfig` → `requireHarness(cfg.harness)`). Tests cannot inject
a harness object, so extensions whose features ride harness capabilities — terminal's whole
surface is `harness.tty` — cannot use the one sanctioned testing path (`docs/testing-extensions.md`).
Terminal instead hand-rolls `fakeSessions()` + an extension-only Hono server, testing against a
parallel implementation of core's contracts. That blindness shipped the reload/replay bug.

`makeApp` already has the DI seam: `opts.harness ?? requireHarness(opts.cfg.harness)` — embed and
client test boots inject `createFakeHarness()` through it today. The seam is just not threaded
through `start()`.

## Design

All DI, no test code in shipped `src` beyond the one pass-through parameter:

1. **core** — `StartOpts` gains `harness?: HarnessAdapter`. `start()` forwards it to `makeApp`.
   Omitted → registry lookup exactly as today; production callers unchanged.
   Implementation note: verify `resolveConfig` does not itself `requireHarness` the config id
   before `makeApp` runs; if it does, derive the config's harness id from the injected
   `harness.id` so no registry entry is required.
2. **extension-testkit** — `bootExtensionServer(extension, opts?: {harness?: HarnessAdapter})`
   and `getExtensionTestApi({server, clientEntry, harness?})` forward the harness to `start()`.
3. **harness-testkit** — `createFakeHarness` gains opt-in `tty?: {command(opts): TtyCommand}`.
   Default stays tty-less; existing consumers unchanged. A terminal test composes:
   `createFakeHarness({tty: {command: () => ({bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}})}})`.
4. **terminal adoption** — new `getExtensionTestApi`-based IT in `packages/extensions/terminal`:
   real engine, real widget host, fake-chat harness with real bash tty. Drives via a11y locators
   per `docs/testing-extensions.md` (xterm runs `screenReaderMode: true`, so terminal output is
   reachable through `getByText`). Covers: open the Terminal view, see live pty output,
   `page.reload()`, assert the restored view shows the pre-reload output — the exact class that
   shipped broken.

## What stays

- `reload-replay.browser.test.tsx` (terminal-browser vitest project) stays as the wire-level
  geometry harness: it pins spawn-size/replay invariants at the model+server layer that a11y-level
  ITs cannot express (cols, buffer fidelity). The `fakeSessions()` server helpers stay for the
  route-level ITs; net-new integration coverage goes through extension-testkit.
- embed/client `BootApp` leaves stay put (out of scope; passing built-ins there is a separate
  two-line decision).

## Error handling

- Injected harness with a `tty` command that fails to spawn → existing pty error path
  (`error` control frame → banner); no new handling.
- `getExtensionTestApi` with both a registered-harness env and an injected harness: injected wins
  (same precedence as `makeApp`).

## Testing the change itself

- The new terminal IT is the acceptance test for the whole stack (core pass-through,
  extension-testkit forwarding, fake-harness tty).
- Existing suites (core, extension-testkit consumers: whiteboard, embed, client) must stay green
  with no call-site changes.
