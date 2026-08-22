---
'@conciv/core': patch
---

Session identity is now established at the transport boundary and read ambiently, instead of being hand-threaded as a parameter.

`@conciv/core` gains a `SessionScope` facade: `CoreRuntime.forSession(id)` returns the only door to a session's tools, page bus, stream, asks, captures, history and run control, and every effectful member of that scope establishes a Node `AsyncLocalStorage` context. Core's interior reads that context through the newly exported `session()` rather than taking a session parameter: the page-tool forwarder, the change journal, the capture sink, and the rpc approval gate no longer accept a session id, and `PermissionGate.decide` loses the session argument it was already ignoring. The raw page-bus, tool-registry, ask-registry and stream primitives are no longer exported outside the facade.

Behavior changes:

- RPC procedures that act on behalf of a session now REJECT a call that carries no `x-conciv-session` header with `UNAUTHORIZED`, instead of silently minting a throwaway session row. Callers resolve a session with `sessions.resolve` and send it on every call.
- `chat.permissionDecision` settles the ask that OWNS the approval id rather than one belonging to the calling header's session, and reports `UNKNOWN_REQUEST` when the decision matches no pending ask.
- Reopen-latest (`sessions.resolve({})`) only considers chat sessions in the caller's working directory, so an agent- or CLI-minted row in another directory is never handed to the widget. The explicit "Split pane" action mints a fresh session instead of reopening the latest one.
- Unused rows are swept for external mints too, not only chat ones.
- Catalog reachability is answered per scope: a page tool is reachable for the session whose widget is connected, while the engine-level catalog keeps the engine-wide answer.
- Native session rows are claimed conflict-safe, so a concurrent `sessions.list` cannot double-insert one harness session.
- `HarnessSessionId` is branded AND constrained to `[A-Za-z0-9_-]{1,128}`. That is hygiene, not the guarantee: every harness transcript path now goes through one shared containment check (`transcriptPathWithin`) that resolves the path (following symlinks) and refuses anything landing outside the harness project root. A `HarnessHistory` that declares `transcriptPath` must also declare `transcriptRoot` — the pair is enforced at the type level, so an adapter that cannot vouch for a root yields no path at all instead of being silently trusted.
- `@conciv/extension`: a server tool's page access now forwards the target page tool's real `mutating` flag (mutations were never journalled through this path before), and the vestigial `__execute` handler surface is removed in favor of `__serverRun`, whose request/page/tools arguments are now required.
- Whiteboard's server router derives the room from the request's session instead of trusting caller input, and scopes element upserts the way bulk deletes were already scoped. The terminal `/tty` route's pre-upgrade session rejection is covered by a test. The recorder's event rings require an explicit client id instead of falling back to whichever client wrote last.
