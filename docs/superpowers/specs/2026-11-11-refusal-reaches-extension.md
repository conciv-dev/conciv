# A core refusal reaches the extension that owns the tool

## Problem

An outside agent (Claude through the conciv plugin, which shells out to `.conciv/bin/conciv`, or the CLI
directly) calls an extension tool with `registry.call({name, input})`. Core can refuse that call before the
extension's handler runs:

- `makeHubAdmission` (top of the core router) throws `APPROVAL_DENIED` for a disconnected hub client.
- `makeSessionOs` runs `admitHubCaller`: the tab shows "Allow codex to use this tab" and the call waits for
  the user; a deny or the 50 s wait throws `APPROVAL_DENIED`.
- `refuseUnapproved` holds an `approval: 'ask'` tool until the user approves it, else `APPROVAL_DENIED`.

All three run in core's own procedure chain, outside the tool. The extension never learns about the call.

## Where the extension already sees its calls

Every extension tool is already an oRPC procedure: `compileTool` in `packages/extension/src/tool-registry.ts`
builds it from `registryBase` (`os.$context<RegistryCallContext>()`), and `registry.call` dispatches to it
with `createRouterClient`. The handler sees the input, the `ToolRequest` (session id, agent id, tool call
id) and throws `toolError`s that the procedure maps onto its declared errors. oRPC middleware wrapping that
procedure sees exactly the same call and anything thrown inside it, including oRPC's own lifecycle helpers
(`onError`, `onFinish`, `onSuccess`, `onStart` from `@orpc/server`).

TanStack AI chat middleware (`onBeforeToolCall` / `onAfterToolCall` / `onError`) only wraps a `chat()` run.
An outside `registry.call` never enters `chat()`, so it cannot carry this refusal.

## Design

Two moves, both inside oRPC:

1. **The extension returns one oRPC middleware from its server factory.** `ServerResult` gains
   `middleware?: ToolMiddleware`, next to `context`. It is a plain oRPC `Middleware` over
   `ToolCallContext = {request: ToolRequest}`. Because the factory creates it, it closes over the extension's
   own state, so no extension context has to travel through oRPC and nothing is cast. Core registers it with
   every tool the extension owns (`registry.register(tool, {owner, context, middleware})`), and
   `compileTool` installs it around the handler; `path` names the tool.

   ```ts
   .server((server) => {
     const store = createStore()
     return {
       context: store,
       middleware: onError((error, {path, context}, input) => store.refused(path.join('.'), context.request, input, error)),
     }
   })
   ```

2. **Core refuses inside the tool's procedure, not before it.** For `registry.call`, core no longer runs the
   hub admission and the `approval: 'ask'` gate in its own chain. It hands them to the tool call as a
   `gate` on the registry call context (`RegistryCallContext.gate`, internal plumbing between core and the
   registry, not part of the authoring API). `compileTool` runs the gate as the innermost middleware, right
   before the handler. A refusal therefore throws through the extension's middleware, with the call's
   `path`, the `input` as the agent sent it (input validation runs after the middleware) and
   `context.request`.

   The gate keeps today's order and messages: disconnected client, then the outside-session admission, then
   the `approval: 'ask'` hold. It also wraps the hub mirror, so only admitted calls are mirrored into the tab,
   as today.

Built-in tools with their own procedures (`server.*`, `editor.open`) and the assist capabilities keep their
current gates; they have no owning extension.

## Public surface added to `@conciv/extension`

- `ServerResult.middleware?: ToolMiddleware`
- `type ToolCallContext` and `type ToolMiddleware`

Tools, `defineTool`, `ExtensionServerTool` and the handler signature stay as they are.

## Not in this change

- In-chat calls (a turn's `approval: 'ask'` hold in `chat`'s code runner) still refuse before the registry.
  Moving that gate onto the same `gate` is the follow-up.
- The design extension adopting `ServerResult.middleware`.

## Test

`packages/core/test/core-api.it.test.ts`: the fixture extension returns an `onError` middleware.
A hub call denied at the outside-session admission and a non-widget call refused at the `approval: 'ask'`
gate both reach it with `APPROVAL_DENIED`, the refusal message, the session id, the tool name and the input.
`packages/extension/test/extension.test.ts`: a registration's middleware sees a `gate` refusal and the handler never runs.
