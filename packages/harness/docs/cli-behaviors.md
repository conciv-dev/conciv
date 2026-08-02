# Verified CLI behaviors

Hand-verified facts about the third-party CLIs the harnesses drive. Each was established by a live
experiment against the stated version on macOS; the connect feature's design depends on them. When a
CLI update breaks connect behavior, start here: re-verify the fact for that CLI, then update this
file with the new version stamp. Full experiment procedures live in git history
(`packages/harness/test/*.manual.md`, removed 2026-08-02).

## claude (2.1.220, verified 2026-07-30)

- A plugin's HTTP MCP server attaches to an ALREADY-RUNNING session after install + in-session
  reload: full initialize handshake, connected in `/mcp`, model can call its tools, custom headers
  from `.mcp.json` forwarded.
- Hooks fire after that reload for UserPromptSubmit, Stop, SessionEnd. SessionStart does NOT fire on
  reload (the session already started) — the first UserPromptSubmit is the earliest reliable
  "attached session is live" signal; attach-time handshakes must be MCP-driven or tolerate arriving
  one prompt late.
- Hook bodies carry `session_id`, `transcript_path`, `cwd` on every event — enough to identify and
  follow a session conciv did not launch.
- `claude agents --json` lists sessions launched in other terminals (tmux included) with pid, cwd,
  sessionId, live status — external discovery works.
- One STATIC plugin serves every conciv session: `.mcp.json` uses a stdio bridge whose only variable
  is the conciv MCP url; identity rides the `conciv-claude-session` header resolved server-side;
  hooks need no header (body already has `session_id`). Nothing per-adoption is baked into plugin
  files, so re-adopting never rewrites another session's routing. (`.mcp.json` does NOT expand
  `${VAR}` in `headers` — that path is a dead end.)

## codex (codex-cli 0.145.0, verified 2026-07-30)

- `-c` overrides reach the interactive TUI for `mcp_servers` and `hooks`; custom HTTP headers
  survive. Tables MERGE with the user's config — a launch cannot suppress the user's own MCP
  servers, and the built-in `codex_apps` server always remains.
- Hooks must be declared WITHOUT `async` — `async = true` hooks are rejected (`async hooks are not
supported yet`) and only a TUI warning reveals it. SessionEnd fires with `session_id`,
  `transcript_path`, `cwd`, `reason`.
- Trust friction: interactive prompt on a fresh directory plus one on first sight of a hook command.
  Hook trust is content-hashed per source; command-line hooks attribute to the synthetic source
  `/<session-flags>/config.toml`, so every distinct hook command is a separate trust decision. First
  launch in a new workdir is not unattended.
- The rollout file descriptor stays open for the session's lifetime — usable liveness signal;
  SessionEnd correlates session id to rollout path.

## pi (0.73.1, verified 2026-07-30)

- No `--session-id` flag. Identity = choosing the file path via `--session <path>` (accepts a
  not-yet-existing path); `--session-dir` scopes writes away from the user's session tree. Any
  correlation key must be encoded in the chosen path and mapped on our side.
- `registerTool` accepts a plain JSON Schema object as `parameters` (no TypeBox needed); such tools
  are callable by the model end to end.
- Lifecycle events `session_start` (with `reason`), `tool_call` (with `toolName`), and
  `session_shutdown` all fire — including around a FAILED model turn, so a failed first turn is not
  a failed attach.
- `-ne` disables extension discovery so only our extension loads; without it the user's installed
  extensions load alongside.
