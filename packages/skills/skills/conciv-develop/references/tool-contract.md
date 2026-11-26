# Tool contract, in depth

Tools are added inside `ctx.tool.transform((editor) => ...)`. `editor.namespace({name, description})`
describes a group; `editor.add(definition)` adds one tool. Import `Tool` (for errors and types) from
`@conciv/protocol/schema/tool`, as the plugins conciv ships do, or from the promise entry
`@conciv/backend-plugin-api`; `@conciv/backend-plugin-api/effect` does not export it.

## Every field

The definition is `Tool.Info` and its options are `Tool.Options`
(`packages/protocol/src/schema/tool.ts:29-44`, `packages/protocol/src/schema/tool.ts:105-115`):

| Field                | Meaning                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `name`               | Letters, digits and `_`. With a namespace the tool is `<namespace>_<name>`.                                 |
| `description`        | What the tool does; the agent reads it to decide when to call it.                                           |
| `input`              | zod, any Standard Schema, an Effect Schema or a raw JSON Schema object. The engine checks the input.        |
| `output`             | The output schema. A result with `output` needs one.                                                        |
| `execute`            | `(input, context) => Effect<Result, Tool.Error>`; the promise entry returns a `Promise`.                    |
| `options.namespace`  | The group the tool belongs to.                                                                              |
| `options.codemode`   | Unset or `true`: code mode, the agent calls `external_<namespace>_<name>` from TypeScript. `false`: direct. |
| `options.pinned`     | Code mode only: the code-mode summary always lists the tool.                                                |
| `options.permission` | The action a `deny` rule matches to hide the tool. Defaults to the tool name.                               |

`context` carries `sessionId`, `agent`, `messageId`, the call `id`, `origin` (`chat` or `hub`),
`progress(update)` and an optional `cancel` effect (`packages/protocol/src/schema/tool.ts:14-22`).

The test runner's tools, from `packages/plugins/test-runner/src/tools.ts:9-36`:

```ts
const codeMode = {namespace: 'test_runner', codemode: true}
const direct = {namespace: 'test_runner', codemode: false}

function toolFailure(error: RunnerUnavailable) {
  return Effect.fail(Tool.toolError({message: error.message, error}))
}

export const register = Effect.fn('TestRunnerTools.register')(function* (
  ctx: Pick<Context, 'tool'>,
  manager: TestRunnerManager,
) {
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'test_runner',
      description: "The project's test runner: list the test files, run them or a pattern, read the last result.",
    })
    editor.add({
      name: 'list',
      description: 'List the test files without running them.',
      input: z.object({}),
      output: ListResultSchema,
      options: codeMode,
      execute: () =>
        manager.list(false).pipe(
          Effect.map((output) => ({output})),
          Effect.catchTag('TestRunner.RunnerUnavailable', toolFailure),
        ),
    })
```

## Name rule

Any character other than letters, digits, `_` and `-` becomes `_` (`normalizedName`,
`packages/backend-app-api/src/core/tool/runtime.ts:267`), so `dotted.ping` is `dotted_ping`. A `-` is
kept and then refused: `Invalid tool name: hyphen-ping` (`packages/backend-app-api/src/core/tool.ts:338-340`).
The engine logs `Skipping invalid tool registration`, leaves the tool out, and the plugin stays active.

## Results

Succeed with `{output}` (checked against `output`), or `{content}` with text, plus optional `metadata`.
`{output}` with no `output` schema fails the call with "Tool result declared output without an output
schema", and a tool with an `output` schema that returns no `output` fails with "Tool did not return its
declared output" (`packages/backend-app-api/src/core/tool/runtime.ts:32-41`).

## Errors

Fail the effect with a `Tool.Error` built by `Tool.makeError({message})` or
`Tool.toolError({message, metadata})` (`packages/protocol/src/schema/tool.ts:63-76`). Map a typed failure
once, at the edge. The TanStack plugin, from `packages/plugins/tanstack/src/tools.ts:155-159`:

```ts
      execute: () =>
        tanstack.buildErrors().pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(bundlerFailure),
        ),
```

`Effect.catchTag('Name', (failure) => Effect.fail(Tool.toolError({message})))` does the same for one
tag, as `toolFailure` above. In the promise entry, `throw Tool.toolError(...)`; any other thrown error
becomes a `Tool.Error` with its message.

## Approvals

A tool that changes real state asks first. Push an `ask` rule for its action to every agent, then assert
inside `execute`; the assert succeeds once the user allows and fails the call on a deny. The iOS plugin,
`ASKING_RULES` and `confirmed` from `packages/plugins/ios/src/tools.ts:56-60` and
`packages/plugins/ios/src/tools.ts:155-165`:

```ts
const ASKING_RULES: Permission.Rule[] = ['ios_build', 'ios_run'].map((action) => ({
  action,
  resource: '*',
  effect: 'ask',
}))
```

```ts
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

The rules go to every agent with `ctx.agent.transform` (`packages/plugins/ios/src/tools.ts:191`):

```ts
yield * ctx.agent.transform((editor) => editor.list().forEach((agent) => agent.permissions.push(...ASKING_RULES)))
```

The ask shows as a card in the chat. `fallback: 'ask'` asks even when the only rule that allows the
action is a catch-all `*` rule.

## Skills and prompt rules

`ctx.skill.transform((editor) => editor.add(info))` adds a `Skill.Info` (`id`, `name`, `description`,
`path`, `content`); see `info` in `packages/plugins/recorder/src/skill.ts:4-9`. A session `context` hook
adds text to the system prompt before every request. The iOS plugin, from
`packages/plugins/ios/src/tools.ts:246`:

```ts
yield * ctx.session.hook('context', (event) => Effect.sync(() => event.system.push({type: 'text', text: rules})))
```

## Page work belongs to the page plugin

A tool that acts on the user's page calls the page plugin's RPC (`ctx.rpc(PageDefinition)`, with
`Definition` imported from `@conciv/plugin-page/rpc`; `packages/plugins/tanstack/src/tools.ts:9`), which
runs the matching `PageOperation` the plugin's browser part added.

## Sources

- `packages/protocol/src/schema/tool.ts`
- `packages/backend-app-api/src/core/tool.ts`
- `packages/backend-app-api/src/core/tool/runtime.ts`
- `packages/plugins/test-runner/src/tools.ts`
- `packages/plugins/recorder/src/skill.ts`
- `packages/plugins/tanstack/src/tools.ts`
- `packages/plugins/ios/src/tools.ts`
