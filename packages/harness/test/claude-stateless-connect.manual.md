# Stateless claude connect: identity spike

Goal: let ONE static connect plugin serve every conciv session, with the claude session
identifying itself on each MCP request, instead of baking a conciv session id into
`.mcp.json` / `hooks.json` (which makes the plugin a single per-project slot that the
second adopt hijacks).

Run against `claude 2.1.220` on macOS. Scratch marketplace + plugin under a temp dir, a
Node "sink" standing in for the conciv MCP route (logs every request's headers and body),
`~/.claude/plugins/{config,installed_plugins,known_marketplaces}.json` backed up and
restored afterwards.

## Question 1: does a plugin `.mcp.json` expand `${VAR}` in `headers`?

Plugin shipped `type: "http"` with these header values, then `claude -p` was launched with
`SPIKE_SHELL_MARKER=marker-abc` and with `CLAUDE_CODE_SESSION_ID` explicitly unset:

| header value written                | value the server received   |
| ----------------------------------- | --------------------------- |
| `static-value`                      | `static-value`              |
| `${SPIKE_SHELL_MARKER}`             | `marker-abc`                |
| `${SPIKE_UNSET_VAR:-fallbackworks}` | `fallbackworks`             |
| `${CLAUDE_CODE_SESSION_ID}`         | `${CLAUDE_CODE_SESSION_ID}` |
| `${CLAUDE_SESSION_ID}`              | `${CLAUDE_SESSION_ID}`      |

Expansion works, including `:-` defaults, and reads the env claude itself was launched
with. But claude does NOT have its own session id in that env: both session variables came
through unexpanded, i.e. undefined. `CLAUDE_SESSION_ID` does not exist at all;
`CLAUDE_CODE_SESSION_ID` exists only in the env claude hands to child processes, and the
`.mcp.json` expansion happens before that.

## Question 2: does claude identify itself on the MCP wire?

Everything an `http` MCP server sees, across `initialize`, `notifications/initialized`,
`tools/list` and `tools/call`:

- `user-agent: claude-code/2.1.220 (sdk-cli)` - version only, no session.
- `initialize` params `clientInfo`: `{name: "claude-code", title, version, description, websiteUrl}` - no session.
- `tools/call` params `_meta`: `{"claudecode/toolUseId": "toolu_…", "progressToken": 2}` - per-call, not per-session.

The child's real session id (`d0673620-…`, reported by `claude -p --output-format json`)
appeared ZERO times in the whole captured request log.

So an `http` MCP server cannot learn which claude session is calling it. Header expansion
alone is not enough.

## Question 3: does a `stdio` MCP server get the session id?

A plugin `.mcp.json` entry of

```json
{"type": "stdio", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/probe.mjs"]}
```

is spawned as a child of claude, and children DO get the session env. The probe dumped its
own `process.env`:

```
CLAUDE_CODE_SESSION_ID=d0673620-7db5-4277-b7d9-feab6ca1b091
CLAUDE_PLUGIN_ROOT=/…/mkt/sinkplug
CLAUDE_PLUGIN_DATA=/Users/…/.claude/plugins/data/sinkplug-sinkmkt
CLAUDE_PROJECT_DIR=/…/proj
```

`d0673620-…` is exactly the session id `claude -p --output-format json` reported for that
run. `${CLAUDE_PLUGIN_ROOT}` expands in `command`/`args`, and a per-server `env` block is
also honoured, so the conciv MCP url can be passed in without any per-session content.

## Question 4: does a transparent stdio -> http bridge actually work?

A ~30 line `proxy.mjs` that reads JSON-RPC lines from stdin, POSTs each verbatim to the
http endpoint with `conciv-claude-session: process.env.CLAUDE_CODE_SESSION_ID`, and writes
non-empty responses back to stdout. Result of `claude -p "Call the sink_ping tool, then
reply with exactly what it returned."`:

```
RESULT: sink_ping return: `sink ok`
initialize              -> conciv-claude-session: 50e0fc4b-d8b0-4a78-9f75-57043496ff23
notifications/initialized -> conciv-claude-session: 50e0fc4b-d8b0-4a78-9f75-57043496ff23
tools/list              -> conciv-claude-session: 50e0fc4b-d8b0-4a78-9f75-57043496ff23
tools/call              -> conciv-claude-session: 50e0fc4b-d8b0-4a78-9f75-57043496ff23
```

Tool discovery, invocation and the result round-trip all work, and every request carries
the calling claude session's own id.

## Verdict

The static plugin is achievable. The `.mcp.json` entry becomes a `stdio` bridge whose only
variable is the conciv MCP url; identity rides `conciv-claude-session` and is resolved
server-side through the existing claude-session-id -> conciv-session mapping. Hooks need no
header at all, because the hook body already carries `session_id`.

Nothing in the generated plugin depends on which conciv session adopted, so the same
installed plugin serves every adopted session and re-adopting never rewrites another
session's routing.

## Residual risk

`CLAUDE_CODE_SESSION_ID` is frozen at bridge-spawn time. If claude changes its session id
mid-process without respawning MCP servers, the bridge reports the old id. The server
therefore treats an unresolvable claude session id the same as a missing header (unscoped)
rather than failing the call, and the `SessionStart` hook keeps re-recording the mapping.

## Reproducing

1. Back up `~/.claude/plugins/{config,installed_plugins,known_marketplaces}.json`.
2. Build a scratch marketplace + plugin, point its `.mcp.json` at a local sink.
3. `claude plugin marketplace add <dir>` then `claude plugin install <plugin>@<marketplace> --scope local` from a scratch cwd.
4. `claude -p --output-format json --permission-mode bypassPermissions "…"` with `CLAUDE_CODE_SESSION_ID` unset in the launching env, so any value observed came from claude.
5. `claude plugin uninstall …` + `claude plugin marketplace remove …`, then diff the three config files against the backups.
