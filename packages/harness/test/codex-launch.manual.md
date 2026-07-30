# Codex launch overrides and hooks

Date: 2026-07-30. Codex version: codex-cli 0.145.0 (`codex --version`). macOS 25.6.0.

## Question

Do `-c` overrides passed on the command line reach an interactive codex TUI, do they replace or merge
with configured tables, do lifecycle hooks declared that way actually run, and what trust friction
stands in the way?

## Procedure

1. Reused the hook sink on 127.0.0.1:47811 and the minimal MCP server on 127.0.0.1:47812 from the
   claude spike.
2. Wrote a stable wrapper `hook-post.sh` that reads the hook payload on stdin and curls it to the sink
   with a header taken from `$CONCIV_SPIKE_ID`.
3. Exported `CONCIV_SPIKE_ID=conciv_spike_b` in the tmux session, then launched:

```
codex \
  -c 'mcp_servers={conciv={url="http://127.0.0.1:47812/mcp",http_headers={"conciv-session-id"="conciv_spike"}}}' \
  -c 'hooks.SessionStart=[{hooks=[{type="command",command="<abs>/hook-post.sh",async=true}]}]' \
  -c 'hooks.SessionEnd=[{hooks=[{type="command",command="<abs>/hook-post.sh"}]}]'
```

4. Answered the directory trust prompt and the hooks review prompt, listed `/mcp`, sent a prompt,
   checked open file descriptors, then quit.
5. Ran a second launch under an isolated `CODEX_HOME` whose `config.toml` already declared an MCP
   server named `preexisting`, with the same `-c mcp_servers={conciv=...}` override, to settle the
   merge-versus-replace question without touching the user's config.

## Evidence

Two prompts appear at startup. The directory trust prompt:

```
> You are in /private/tmp/.../scratchpad/spikeB
  Do you trust the contents of this directory? Working with untrusted contents comes with higher risk
  of prompt injection. Trusting the directory allows project-local config, hooks, and exec policies
  to load.
› 1. Yes, continue
  2. No, quit
```

Then the hooks review prompt:

```
  Hooks need review
  1 hook is new or changed.
  Hooks can run outside the sandbox after you trust them.
› 1. Review hooks
  2. Trust all and continue
  3. Continue without trusting (hooks won't run)
```

The review screen shows where a command-line hook is attributed from, and rejects one of the two:

```
⚠ skipping async hook in /<session-flags>/config.toml: async hooks are not supported yet
  Event                 Installed   Active      Review      Description
  SessionStart          0           0           0           When a new session starts
  SessionEnd            1           0           1           Right before a session ends
```

After pressing `t` to trust all, SessionEnd became Installed 1 / Active 1. The trust decision persists
in `~/.codex/config.toml` keyed by that virtual path:

```toml
[hooks.state."/<session-flags>/config.toml:session_end:0:0"]
trusted_hash = "sha256:bda0670862b941ee351d178a26429afa34b7dfe6c3e6a2248aac7ad8e1f148d1"
```

The MCP server received the handshake with the injected header:

```
POST /mcp  conciv-session-id: conciv_spike
{"method":"initialize","params":{"protocolVersion":"2025-06-18", ...,
 "clientInfo":{"name":"codex-mcp-client","title":"Codex","version":"0.145.0"}}}
```

`/mcp` in the TUI listed it:

```
  • conciv
    • Auth: Unsupported
    • Tools: spike_ping
```

The rollout file stays open for the life of the session:

```
codex 58461 omrikatz 47u REG ... /Users/omrikatz/.codex/sessions/2026/07/30/rollout-2026-07-30T16-42-29-019fb343-....jsonl
```

SessionEnd reached the sink on quit, carrying the spike env var through to the hook process:

```
x-spike-id: conciv_spike_b
{
  "session_id": "019fb343-2504-7f43-8d1b-667f5c098235",
  "transcript_path": "/Users/omrikatz/.codex/sessions/2026/07/30/rollout-2026-07-30T16-42-29-019fb343-....jsonl",
  "cwd": "/private/tmp/.../scratchpad/spikeB",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

The isolated `CODEX_HOME` run listed both servers, so the override did not displace the configured one:

```
  • conciv
    • Tools: spike_ping
  • preexisting
    • Tools: spike_ping
```

## Verdicts

- Do `-c` overrides reach the interactive TUI? Yes, for both `mcp_servers` and `hooks`. Custom HTTP
  headers on an MCP server survive the trip.
- Merge or replace? Merge. With an isolated codex home that already declared `preexisting`, adding
  `-c mcp_servers={conciv=...}` produced both entries. There is no whole-table suppression, so a
  launch cannot hide the user's own servers this way. Codex also keeps its built-in `codex_apps`
  server regardless.
- Do hooks fire? SessionEnd fired with `session_id`, `transcript_path`, `cwd`, `hook_event_name` and
  `reason`, and the launching environment is visible to the hook process. SessionStart never ran,
  because `async = true` hooks are rejected outright in 0.145.0 with the message `async hooks are not
supported yet`. Dropping `async` is required for a hook to install at all.
- Trust friction: two prompts on a fresh directory, one for the directory and one for the hooks. Both
  are interactive with no bypass flag used here. The hook trust is content-hashed and stored per
  source, so changing the hook command re-triggers review. A command-line hook is attributed to the
  synthetic source `/<session-flags>/config.toml`, which means every distinct hook command we launch
  with is a separate trust decision under that same virtual path.
- Version: codex-cli 0.145.0. An update to 0.146.0 was advertised and not taken.

## Implications

The codex phase proceeds, with three concrete adjustments. Hooks must be declared without `async`,
otherwise they are silently skipped and only a warning line in the TUI reveals it. Launching cannot
suppress the user's existing MCP servers, so any assumption that our server is the only one present
has to go. Startup costs an interactive trust prompt on a directory codex has not seen before and
another on first sight of our hook command, so the first launch in a new workdir is not unattended.
The rollout file descriptor staying open for the session's lifetime is a usable liveness signal, and
SessionEnd gives us both the session id and the rollout path for correlation.

## Notes on state

`~/.codex/config.toml` was backed up before the spike. The two entries the spike added, the scratch
project trust level and the `hooks.state` entry above, were removed afterwards. The remaining
difference against the backup consists of `codex-tanstack` project trust entries written by other
sessions running concurrently, which were left untouched. The isolated `CODEX_HOME` contained a copy
of `auth.json` and was deleted in full.
