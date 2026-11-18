# The session terminal lives in core

Status: ruled 2026-11-17 (orchestrator, "as opencode"; the owner may reverse any point). Port of the old
`packages/extensions/terminal` extension, now deleted: the terminal is built into core. Reference: opencode at a1aa513 (`_ref/opencode`).

## What moves where

- The pty store (`pty-sessions`, `osc-busy`, `frame-injector`, `spawn-helper-fix`) moves into core as an internal
  module, `packages/core/src/pty/`, as the source keeps its pty in core (`packages/core/src/pty/`,
  `packages/core/src/persistent-pty/`).
- The engine serves the terminal through core routes, as the source does (`packages/protocol/src/groups/persistent-pty.ts`,
  handlers `packages/server/src/handlers/persistent-pty.ts`). A plugin gets no HTTP, websocket or stream member: the
  source's plugin `Context` has none (`packages/plugin/src/promise/plugin.ts:27-60`).
- The terminal's UI is a built-in browser plugin (PR 2), as the source's `packages/gui-plugins/src/terminal/`. It reaches
  the routes through `ctx.client` and opens the websocket on `ServerRef.url`.
- Always on, whenever the session's harness has a terminal command. No `extensions: [terminal()]` opt-in. The source
  gates its panel on a server capability (`gui-plugins/src/terminal/model.ts:174`, `info.capabilities.persistentPty`).

## Procedures

The source's group and names, `experimental.persistentPty.*`, keyed by `ptyID`, only the procedures the panel calls.
The old panel calls only open and close (`packages/extensions/terminal/src/client/terminal-panel-view.tsx:72,173`); size
changes travel on the socket. So:

| Procedure                            | Source                                                                                                              | conciv                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create({sessionID, size?, model?})` | `persistent-pty.ts` `persistentPty.create`, input `command, args, title, env, size`                                 | No command, args, env or title: the engine runs the session's harness CLI (`ttyCommand`). Returns the session's live pty when one exists (resized to `size`) instead of a second one: two CLIs would resume the same CLI session. `model` overrides the session's model for the CLI. Refused with `NO_TTY` when the harness has no terminal command. |
| `remove({ptyID})`                    | `persistentPty.remove`                                                                                              | Refused with `BUSY` while the CLI is busy.                                                                                                                                                                                                                                                                                                           |
| `connectToken({ptyID})`              | `persistentPty.connectToken`: needs the `x-opencode-ticket` header and an allowed origin (`handlers/pty.ts:80-101`) | No extra header: the source's header exists only to force a CORS preflight, and conciv's RPC call is already a JSON POST behind the engine's token and its CORS allowed origins (`corsMiddleware` with `allowedOrigins`, `packages/core/src/engine-login.ts:350-358`, `app.ts:883`). Single use, 60 s (`core/src/pty/ticket.ts:9`).                  |
| `connect` (websocket)                | `GET /api/experimental/persistent-pty/:ptyID/connect?ticket=`                                                       | Same: the ticket in the query, checked on upgrade, refused 403 without one; 4404 when the pty is gone.                                                                                                                                                                                                                                               |

Not added, no caller: `list`, `get`, `update`, `snapshot`, `read`, `shutdown`, `handoff`. Added only when PR 2's
panel calls them. Events `persistent-pty.added/removed/updated`: only if the panel reads them.

`Info` is the source's (`schema/src/persistent-pty.ts:9`) where conciv has the field, plus `busy` (the CLI's own
OSC 9;4 progress state), which the source has no counterpart for.

## Differences from the source (each named in the PR body)

1. `create` takes no command; one pty per session; it returns the live one.
2. `Info.busy`; `remove` refuses `BUSY`.
3. The CLI's MCP address is the engine's loopback address (`ctx.harness.mcpUrl` difference, plugin README `:267`), not
   the origin the browser called; behind a proxy the CLI talks to loopback.
4. The panel's toolbar goes in `session.panel.end`, ported from the source's registries
   (`plugin/src/gui/registries.ts:893-894`), same name and shape.
5. No view lock while the CLI is busy (the source has none).
6. The picked model is kept in `Store.global`, as the source; the old localStorage `conciv-model` choice is not migrated.
7. Socket frames (ruled (a)): the transport is the source's (path, ticket in the query, 403 without, 4404 when gone,
   origin check) but the frames are conciv's existing ones: raw pty bytes out plus JSON `exit|busy|error`, JSON
   `resize|inject` in, anything else raw input (`packages/protocol/src/terminal-types.ts`). The source's `attached` /
   `replay_complete` frames, roles, cursors and framed input (`handlers/persistent-pty.ts:150-240`) serve its pty
   daemon, which conciv does not have.

8. Field names are camelCase (`sessionId`, `ptyId`, `expiresIn`), not the source's `sessionID` / `ptyID` /
   `expires_in`: every contract input uses `sessionId` (`packages/contract/src/contract.ts:46`), and outside-agent
   consent finds the session by parsing `{sessionId}` from the input (`packages/core/src/api/rpc/mount.ts:120,174`).
   Ids are `pty_<uuid>`, as the source's `"pty_" + ascending()`.
9. Outside (hub-origin) agents: every `experimental.persistentPty.*` call from one is refused `APPROVAL_DENIED`, as
   `plugin.call` and `event.subscribe` are (`refuseOutside`, `packages/core/src/api/rpc/mount.ts`). `remove` and
   `connectToken` carry only a `ptyId`, so consent could not find a session; outside agents have their own CLI. A
   ticket remembers the origin that minted it, and the socket refuses one presented from another origin, as it
   refuses none.
10. Revoke (ruled (B)): the socket goes through core's `trustingUpgrade` (`packages/core/src/engine-login.ts`), as
    the old `/tty` did, and checks the ticket as well. It is admitted only with a valid ticket AND the engine trust (a
    bearer header or a first `conciv:trust` frame), so revoking a browser closes its terminal socket with 1008, the
    same as main. The panel, a first-party built-in, opens it with `engineWebSocket`. The source's socket is
    ticket-only because the source has no per-browser revoke to honour.
11. The panel learns whether a session has a terminal from `HarnessMeta.persistentPty` (the source's capability
    name, `gui-plugins/src/terminal/model.ts:174`), returned by `meta.models({sessionId})`, true when the session's
    harness has a `ttyCommand`. The source's flag is one per server; conciv's harness is per session. No pty is
    created until the Terminal tab is opened.
12. `session.panel.end` draws at the end of the status bar's view tab list (`apps/conciv/src/pane/status-bar.tsx`),
    conciv's counterpart of the source's side region tab strip.
13. The panel's state is one Solid store for one run: a generation counter, one live record and one failure record,
    not the source's attempt machine (`gui-plugins/src/terminal/model.ts:166-230`, `machine.ts`). A record applies
    when its key, the session id plus the generation, matches; opening the terminal for another session replaces the
    live record rather than keeping one per session. Conciv runs one CLI per session and has no terminal
    list, so there is nothing for the machine to choose between. Moving it to an Effect model file is the planned
    conversion once the shared command loop exists.

## Open

- `ctx.harness`: removed in the last commit of the port only if the terminal was its only reader (traced first).
- Grab button and Enter pasting staged grabs: a later PR after the page branch; until then the toolbar has no grab button.
