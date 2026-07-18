# Agent pairing prompt reframe

## Problem

Pasting the widget's agent prompt (`Read <origin>/pair/<token> and follow the instructions`)
into a coding agent (Claude Code) dead-ends: the agent's safety layer refuses to run
`npx @conciv/try --token <token>`. User approval in chat does not override it.

Two independent triggers:

1. **Prompt shape.** "Fetch a URL and follow its instructions" is the canonical
   prompt-injection pattern. Instructions sourced from fetched web content are
   distrusted by design, and the fetched text was written as second-person
   imperatives to the agent ("You are connecting this machine…", "KEEP IT RUNNING"),
   which reads as injected commands rather than documentation.
2. **Action shape.** The command spawns a persistent, token-gated process that
   bridges a browser to the local machine. Framed without context, that matches
   a network-bridging / remote-control pattern.

## Fix

Reframe both surfaces; change the flow so refusal cannot dead-end. No change to
the actual protections (127.0.0.1 binding, per-token gate, origin-scoped CORS).

1. **The pasted prompt carries the intent and the command itself.** The user's own
   message states first-person intent ("I'm pairing my browser tab…"), names the
   exact command, states the local-only scope, and explicitly sanctions hand-off
   ("or tell me to run it myself"). The /pair URL becomes optional reference
   material, not the instruction source — the injection shape is gone.
2. **`/pair/<token>` returns markdown documentation, not imperatives.**
   `text/markdown; charset=utf-8`, structured for both humans and agents:
   what the command is, precisely what it does (loopback bind, token gate,
   origin-locked CORS, throwaway workspace, no data to conciv servers), and an
   explicit section for coding agents that (a) states the user initiated this
   from their own browser and (b) sanctions handing the command back to the user
   to run in their own terminal. Facts only — no reassurance beyond what the
   code enforces.
3. **Hand-off is a first-class completion path.** An agent unwilling to own a
   long-lived process completes the flow by showing the user the command; the
   widget's probe loop doesn't care who ran it. The widget already exposes the
   raw command under "or run it yourself".

## Verification

Paste old vs new prompt into fresh headless Claude Code sessions (the /pair URL
served with the old plain text vs the new markdown, matching pre/post deploy
production). Old: refusal. New: proceeds to run or cleanly hands the command to
the user. Unit tests pin the markdown content-type, the embedded command, and
the hand-off section.

## Addendum: human-run is primary (2026-07-17)

Real-session testing showed reframing alone is not reliable: a fresh Claude
Code session still declined, objecting that `npx @conciv/try` is an unvettable
unknown package (arbitrary code execution) — an objection no copy can fix. It
did land on the sanctioned hand-off ("you run it in your own terminal"), so the
flow no longer dead-ends, but the primary path must not depend on agent trust.

- Widget step 1 flips: the `npx` command is the primary copy row; the agent
  prompt moves into the collapsed "or hand it to your coding agent" alternative,
  noting that agents asking you to run it yourself is expected.
- The pair markdown gains a "Vetting the package" section (source repo +
  directory, `npm view`, CLI entry) so a cautious agent has a verification path,
  and frames "ask the user to run it" as the expected default — a successful
  outcome, not a refusal.
- Live testing also surfaced contract skew: the published @conciv/try core
  (0.0.11) requires `chat.send({text})` while the branch widget sent the newer
  `{content}` shape → "Input validation failed" on every message. The client now
  sends `text` for plain strings (valid against both contracts) and `content`
  only for attachment parts; a changeset releases the new contract with the
  merge.
