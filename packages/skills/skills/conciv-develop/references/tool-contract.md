# Tool contract, in depth

Tools are added inside `ctx.tool.transform((editor) => ...)`. `editor.namespace({name, description})`
describes a group; `editor.add(definition)` adds one tool. Import `Tool` (for errors and types) from
`@conciv/plugin/schema/tool` or from `@conciv/plugin`; `@conciv/plugin/effect` does not export it.

## Every field

| Field                | Meaning                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `name`               | Letters, digits and `_`. With a namespace the tool is `<namespace>_<name>`.                           |
| `description`        | What the tool does; the agent reads it to decide when to call it.                                     |
| `input`              | zod, any Standard Schema, an Effect Schema or a raw JSON Schema object. The engine checks the input.  |
| `output`             | The output schema. A result with `output` needs one.                                                  |
| `execute`            | `(input, context) => Effect<Result, Tool.Error>`; the promise entry returns a `Promise`.              |
| `options.namespace`  | The group the tool belongs to.                                                                        |
| `options.codemode`   | Default code mode: the agent calls `external_<name>` from TypeScript. `false` makes it a direct tool. |
| `options.pinned`     | Code mode only: the code-mode summary always lists the tool.                                          |
| `options.permission` | The action a `deny` rule matches to hide the tool. Defaults to the tool name.                         |

`context` carries `sessionId`, `agent`, `messageId`, the call `id`, `progress(update)` and an optional
`cancel` effect.

## Name rule

Any character other than letters, digits, `_` and `-` becomes `_` (`dotted.ping` is `dotted_ping`).
A `-` is kept and then refused: the engine logs `Invalid tool name: hyphen-ping`, leaves the tool
out, and the plugin stays active.

## Results

Succeed with `{output}` (validated against `output`), or `{content}` with text, plus optional
`metadata`. `{output}` with no `output` schema fails the call with "Tool result declared output
without an output schema".

## Errors

Fail the effect with a `Tool.Error` built by `Tool.makeError({message})` or
`Tool.toolError({message, metadata})`. Map a typed failure once, at the edge:

```ts
execute: () =>
  tanstack.buildErrors().pipe(
    Effect.map((output) => ({output})),
    Effect.mapError(bundlerFailure),
  ),
```

`Effect.catchTag('Name', (failure) => Effect.fail(Tool.makeError({message})))` does the same for one
tag. In the promise entry, `throw Tool.toolError(...)`.

## Approvals

A tool that changes real state asks first. Push an `ask` rule for its action to every agent, then
assert inside `execute`; the assert succeeds once the user allows and fails with a `Tool.Error` on a
deny:

```ts
const ASKING_RULES: Permission.Rule[] = ['ios_build', 'ios_run'].map((action) => ({
  action,
  resource: '*',
  effect: 'ask',
}))

yield * ctx.agent.transform((editor) => editor.list().forEach((agent) => agent.permissions.push(...ASKING_RULES)))

function confirmed(permission: Context['permission'], action: string, tool: Tool.Context) {
  return permission.assert({
    action,
    resources: ['*'],
    save: ['*'],
    metadata: {},
    sessionId: tool.sessionId,
    agent: tool.agent,
    source: {type: 'tool', messageId: tool.messageId, id: tool.id},
  })
}
```

The ask shows as an Approve or Deny card in the chat.

## Skills and prompt rules

`ctx.skill.transform((editor) => editor.add(info))` adds a `Skill.Info` (`id`, `name`, `description`,
`path`, `content`). A session `context` hook adds text to the system prompt before every request:

```ts
yield * ctx.session.hook('context', (event) => Effect.sync(() => event.system.push({type: 'text', text: rules})))
```

## Page work belongs to the page plugin

A tool that acts on the user's page calls the page plugin's RPC (`ctx.rpc(PageDefinition)` from
`@conciv/plugin-page/rpc`), which runs the matching `PageOperation` the plugin's browser part added.

## Sources

- `packages/plugin-host/src/core/tool.ts`
- `packages/plugins/recorder/src/tools.ts`
- `packages/plugins/tanstack/src/tools.ts`
- `packages/plugins/ios/src/tools.ts`
- `packages/plugins/recorder/src/skill.ts`
