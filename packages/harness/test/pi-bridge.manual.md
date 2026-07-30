# Pi flags and extension bridge

Date: 2026-07-30. Pi version: 0.73.1 (`pi --version`). macOS 25.6.0.

## Questions

Does the installed pi accept a caller-chosen session id, does `registerTool` take a raw JSON Schema
rather than a TypeBox schema, is such a tool actually callable by the model, and do lifecycle events
reach an extension?

## Procedure

1. Read `pi --help` and `pi --version`.
2. Read the extension API from `packages/coding-agent/docs/extensions.md` in the local pi-mono clone,
   read-only.
3. Wrote a scratch extension registering `spike_echo` with a hand-written JSON Schema object instead
   of `Type.Object(...)`, and subscribing to `session_start`, `session_shutdown` and `tool_call`, all
   appending to a log file.
4. Ran non-interactively with extension discovery disabled so only the scratch extension loaded:

```
pi -ne -e <scratch>/ext.ts --provider google --model gemini-2.5-flash \
   --session-dir <scratch>/sessions \
   -p "Use the spike_echo tool with msg hello. Then reply with its output."
```

5. Probed the session flags separately.

## Evidence

`pi --help` in 0.73.1 lists no `--session-id`. The session-related flags are:

```
  --session <path|id>            Use specific session file or partial UUID
  --fork <path|id>               Fork specific session file or partial UUID into a new session
  --session-dir <dir>            Directory for session storage and lookup
  --no-session                   Don't save session (ephemeral)
  --continue, -c                 Continue previous session
  --resume, -r                   Select a session to resume
```

Passing the flag confirms it:

```
$ pi --session-id conciv_spike_test -p "say hi"
Error: Unknown option: --session-id
```

`--session` with a path that does not exist yet creates it, so a caller can still choose the file
name:

```
$ pi -ne --provider google --model gemini-2.5-flash --session <scratch>/sessions/conciv_spike_test.jsonl -p "say hi"
hi
$ ls <scratch>/sessions
2026-07-30T13-47-00-936Z_019fb347-....jsonl
2026-07-30T13-47-20-327Z_019fb347-....jsonl
conciv_spike_test.jsonl
```

The tool run, with the raw JSON Schema, produced a real call and a real result:

```
The output of `spike_echo` with msg "hello" is: `{"spike_echo_response": {"output": "echo:hello"}}`
```

The extension's event log for that run:

```json
{"event":"session_start","data":{"reason":"startup"}}
{"event":"tool_call","data":{"toolName":"spike_echo"}}
{"event":"execute","data":{"msg":"hello"}}
{"event":"session_shutdown","data":{}}
```

An earlier run failed at the model call with `No API key for provider: anthropic`, because the user's
pi default model points at an anthropic model with no key present. The event log for that failed run
still showed `session_start` and `session_shutdown`, so extension lifecycle events fire independently
of whether the turn succeeds.

Every run also printed `Warning: No models match pattern "anthropic/claude-3-7-sonnet-latest"`, which
comes from the user's existing pi settings and is unrelated to the spike.

## Verdicts

- `--session-id`: not supported in 0.73.1. `--session <path>` is the substitute and accepts a path
  that does not exist yet, creating a session file with the name we choose. `--session-dir` scopes
  where sessions are written, which keeps a bridge out of the user's default session tree.
- Raw JSON Schema as `parameters`: accepted. The docs show TypeBox, but a plain
  `{type: 'object', properties: {...}, required: [...]}` object registered cleanly and the model
  produced a well-formed call against it. No TypeBox dependency is needed to register tools.
- Tool callable by the model: yes, `execute` ran and its content came back into the reply.
- Lifecycle events: `session_start` (with a `reason` field, `"startup"` here), `tool_call` (with
  `toolName`) and `session_shutdown` all fired. `session_start` and `session_shutdown` fire even when
  the model turn errors out.
- Version: 0.73.1.

## Implications

The pi phase proceeds. The extension surface gives everything a bridge needs: register a tool with a
plain schema, observe tool calls, and bracket the session with start and shutdown events. Session
identity has to be handled by choosing the file path with `--session`, not by handing pi an id, so
any correlation key we want must be encoded in the path we pick and mapped on our side. A default
model that resolves to a provider without a key fails the turn but not the extension load, so a
bridge should not treat a failed first turn as a failed attach. Extension discovery should be
disabled with `-ne` when we want only our own extension loaded, otherwise the user's installed
extensions load alongside it.

## Notes on state

All session files were written under a scratch `--session-dir`. One empty directory that pi created
under `~/.pi/agent/sessions` for the scratch working directory was removed. Nothing was installed
into pi's settings.
