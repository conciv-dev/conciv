# Claude mid-session plugin attach

Date: 2026-07-30. Claude Code version: 2.1.220 (`claude --version`). macOS 25.6.0.

## Question

Can a claude session that was started before a plugin existed gain that plugin's HTTP MCP server and
its hooks, without restarting the session?

## Procedure

1. Started two local node servers in a scratch directory: a hook sink on 127.0.0.1:47811 that logs
   every POST body and header to a file, and a minimal streamable-HTTP MCP server on
   127.0.0.1:47812 that answers `initialize`, `tools/list`, and `tools/call` for one tool named
   `spike_ping` returning the text `pong`.
2. Started the TUI in tmux with no flags: `cd <scratch> && claude`. Confirmed it was alive by sending
   `Reply with exactly: ALIVE` and reading `ALIVE` back. The status line at this point read
   `1 CLAUDE.md | 2 MCPs | 9 hooks`.
3. Only after the session was running, wrote the marketplace and plugin on disk:
   - `market/.claude-plugin/marketplace.json` with one entry named `conciv-test`
   - `market/conciv-test/.claude-plugin/plugin.json`
   - `market/conciv-test/.mcp.json` pointing at the MCP server with a custom header `x-spike: 1`
   - `market/conciv-test/hooks/hooks.json` registering SessionStart, UserPromptSubmit, Stop and
     SessionEnd, each running a shell script that curls the sink
4. Installed from outside the session, non-interactively:
   - `claude plugin marketplace add <market dir>`
   - `claude plugin install conciv-test@conciv-spike --scope local`

   Both printed success and needed no prompt. The marketplace registration lands in user settings;
   the install landed in the scratch project's local settings.

5. In the running TUI: `/reload-plugins --force`, then `/mcp`, then a prompt asking the model to call
   the new tool, then `/exit`.

## Evidence

Reload output in the TUI:

```
❯ /reload-plugins --force
  ⎿  Reloaded: 11 plugins · 11 skills · 9 agents · 8 hooks · 8 plugin MCP servers · 1 plugin LSP server
```

The MCP server log shows a complete handshake seconds after the reload, from
`claude-code/2.1.220 (cli)`, with the plugin's custom header attached:

```
POST /mcp  x-spike: 1  {"method":"initialize","params":{"protocolVersion":"2025-11-25", ...}}
POST /mcp  {"method":"notifications/initialized"}
GET  /mcp  accept: text/event-stream
POST /mcp  {"method":"tools/list","id":1}
```

`/mcp` inside the same session lists it as connected:

```
  Built-in MCPs (always available)
    plugin:cloudflare:cloudflare-docs · ✔ connected · 2 tools
    plugin:conciv-test:conciv-test · ✔ connected · 1 tool
    plugin:context7:context7 · ✔ connected · 2 tools
```

The model then called the tool for real:

```
❯ Call the spike_ping tool from the conciv-test MCP server and tell me what it returned.
  Called plugin:conciv-test:conciv-test (ctrl+o to expand)
⏺ spike_ping return: pong. Server work.
```

Hooks reaching the sink, in order, with their payload fields:

```
UserPromptSubmit | session_id,transcript_path,cwd,prompt_id,permission_mode,hook_event_name,prompt
Stop            | session_id,transcript_path,cwd,prompt_id,permission_mode,effort,hook_event_name,
                  stop_hook_active,last_assistant_message,background_tasks,session_crons
SessionEnd      | session_id,transcript_path,cwd,prompt_id,hook_event_name,reason
```

Sample UserPromptSubmit body:

```json
{
  "session_id": "758f3da1-2759-42e1-9b49-524139cea6cf",
  "transcript_path": "/Users/omrikatz/.claude/projects/-private-tmp-.../758f3da1-....jsonl",
  "cwd": "/private/tmp/.../scratchpad/spikeA",
  "prompt_id": "0715552d-37c8-4647-92a3-1bfabeeb03e1",
  "permission_mode": "auto",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Call the spike_ping tool from the conciv-test MCP server and tell me what it returned."
}
```

`claude agents --json` listed the tmux session while it ran:

```json
{
  "pid": 45279,
  "cwd": "/private/tmp/.../scratchpad/spikeA",
  "kind": "interactive",
  "sessionId": "758f3da1-2759-42e1-9b49-524139cea6cf",
  "name": "spikea-fe",
  "status": "idle"
}
```

## Verdicts

- Does the MCP server attach mid-session? Yes, at the strongest tier. Not merely a load attempt: the
  server completed the full initialize handshake, appeared as connected in `/mcp`, and the model
  called its tool and got the result back. Custom headers from `.mcp.json` are forwarded.
- Do hooks fire after the reload? Yes for UserPromptSubmit, Stop and SessionEnd. SessionStart did not
  fire on reload, which is expected since the session had already started. Anything that needs to run
  once at attach time cannot rely on SessionStart in a reload path.
- Version: 2.1.220.
- Does `claude agents --json` see a session launched inside tmux? Yes, with pid, cwd, sessionId and
  a live status field, so discovery of an already-running external terminal works.

## Implications

Connecting to an already-running claude session is viable, so the connect-existing tasks proceed as
planned. Two constraints carry into the design. The hook payloads give `session_id`, `transcript_path`
and `cwd` on every event, which is enough to identify and follow a session that we did not launch.
Because SessionStart is silent on reload, the first UserPromptSubmit is the earliest reliable signal
that an attached session is live, and any handshake we need must either be driven from the MCP side
or tolerate arriving one prompt late.

## Notes on state

Marketplace removed with `claude plugin marketplace remove conciv-spike`, which also removed the
installed plugin. `~/.claude/settings.json` has no reference to the spike. Two harmless entries
remain in `~/.claude.json`: a `projects` key for the scratch directory and a `pluginUsage` counter
for `conciv-test@conciv-spike`. These were left alone deliberately because several of the user's
claude sessions were running and rewriting that file.
