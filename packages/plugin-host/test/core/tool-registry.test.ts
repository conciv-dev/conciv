import {describe, expect} from 'vitest'
import {Agent} from '../../src/core/agent.js'
import {Permission} from '../../src/core/permission.js'
import {PluginHooks} from '../../src/core/plugin/hooks.js'
import {Session} from '../../src/schema/session.js'
import {SessionMessage} from '../../src/schema/session-message.js'
import {State} from '../../src/core/state.js'
import {Tool} from '../../src/core/tool.js'
import type {Info} from '../../src/schema/tool.js'
import {executeTool, toolDefinitions} from './lib/tool'
import {Deferred, Effect, Exit, Fiber, Layer, Logger, Schema, SchemaGetter, SchemaIssue, Scope} from 'effect'
import {z} from 'zod'
import {testEffect} from './lib/effect'

const registryLayer = Layer.provideMerge(Tool.layer, PluginHooks.layer)
const it = testEffect(registryLayer)
const identity = {
  agent: Agent.Id.make('build'),
  messageId: SessionMessage.Id.make('msg_registry'),
}
const sessionId = Session.Id.make('conciv_registry')
const call = (name: string, id = `call-${name}`): Parameters<Tool.Snapshot['execute']>[0] => ({
  sessionId,
  ...identity,
  call: {type: 'tool-call', id, name, input: {text: name}},
})

const make = (): Info => ({
  name: 'echo',
  description: 'Echo text',
  input: Schema.Struct({text: Schema.String}),
  output: Schema.Struct({text: Schema.String}),
  execute: ({text}) => Effect.succeed({output: {text}, content: text}),
})

const constant = (text: string): Info => ({
  name: 'constant',
  description: 'Return text',
  input: Schema.Struct({text: Schema.String}),
  output: Schema.Struct({text: Schema.String}),
  execute: () => Effect.succeed({output: {text}, content: text}),
})

const transform = (service: Tool.Interface, tools: Readonly<Record<string, Info>>, options?: Tool.Options) =>
  service.transform((editor) =>
    Object.entries(tools).forEach(([name, tool]) => editor.add({...tool, name, options: options ?? tool.options})),
  )

describe('Tool', () => {
  it.effect('reads the current editor tools by effective name', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: make()}, {namespace: 'acme', codemode: false})
      yield* service.transform((editor) => {
        expect(editor.list().map((tool) => tool.id)).toEqual(['acme_echo'])
        expect(editor.get('acme_echo')?.id).toBe('acme_echo')
        expect(editor.get('acme_echo')?.name).toBe('echo')
        expect(editor.get('missing')).toBeUndefined()
      })
    }),
  )

  it.effect('replays mutations on refreshed sources and restores tools on disposal and scope cleanup', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      let text = 'original'
      const source = yield* Scope.make()
      yield* service
        .transform((editor) => {
          editor.add({...constant(text), name: 'echo', options: {namespace: 'acme', codemode: false}})
          editor.add({...make(), name: 'hidden'})
        })
        .pipe(Scope.provide(source))
      const original = yield* service.snapshot()
      const update = yield* service.transform((editor) => {
        editor.update('missing', () => {
          throw new Error('must not create a tool')
        })
        editor.remove('missing')
        editor.update('acme_echo', (tool) => {
          const execute = tool.execute
          tool.description = 'Updated'
          tool.execute = (input, context) =>
            execute(input, context).pipe(
              Effect.map((result) => ({...result, output: {text: `${result.output.text} updated`}})),
            )
        })
      })
      const scope = yield* Scope.make()
      yield* service.transform((editor) => editor.remove('hidden')).pipe(Scope.provide(scope))
      expect((yield* executeTool(service, call('acme_echo'))).output).toEqual({text: 'original updated'})

      text = 'refreshed'
      yield* service.reload()
      const refreshed = yield* service.snapshot()
      expect(refreshed.definitions[0]?.description).toBe('Updated')
      expect((yield* refreshed.execute(call('acme_echo'))).output).toEqual({text: 'refreshed updated'})
      expect((yield* original.execute(call('acme_echo'))).output).toEqual({text: 'original'})

      yield* update.dispose
      yield* update.dispose
      expect((yield* executeTool(service, call('acme_echo'))).output).toEqual({text: 'refreshed'})
      yield* Scope.close(scope, Exit.void)

      yield* service.transform((editor) =>
        editor.update('acme_echo', (tool) => {
          tool.description = 'Updated again'
        }),
      )
      yield* Scope.close(source, Exit.void)
      expect((yield* service.snapshot()).definitions.map((tool) => tool.name)).toEqual([])
    }),
  )

  it.effect('updates schemas and executors without renaming tools and applies removal in order', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* service.transform((editor) => {
        editor.add({...make(), options: {namespace: 'acme.tools', codemode: false}})
        editor.add({...make(), name: 'removed', options: {codemode: false}})
        editor.remove('removed')
        editor.update('removed', () => {
          throw new Error('must not resurrect a tool')
        })
        editor.remove('acme_tools_echo')
        editor.add({...make(), options: {namespace: 'acme.tools', codemode: false}})
        editor.update('acme_tools_echo', (tool) => {
          tool.name = 'renamed'
          tool.options = {namespace: 'other', codemode: false}
          tool.input = Schema.Struct({value: Schema.Finite})
          tool.output = Schema.Finite
          tool.execute = ({value}) => Effect.succeed({output: value + 1})
        })
      })
      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['acme_tools_echo'])
      expect(snapshot.definitions[0]?.inputSchema.properties).toEqual({value: {type: 'number'}})
      expect(
        (yield* snapshot.execute({
          ...call('acme_tools_echo'),
          call: {
            type: 'tool-call',
            id: 'updated',
            name: 'acme_tools_echo',
            input: {value: 2},
          },
        })).output,
      ).toBe(3)
      expect((yield* snapshot.execute(call('acme_tools_echo')).pipe(Effect.flip))._tag).toBe('Tool.Error')
    }),
  )

  it.effect('converts schemas at registration and reuses them in every snapshot', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      let builds = 0
      const portable = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value: unknown) => ({value}),
          jsonSchema: {
            input: () => {
              builds++
              return {type: 'object', properties: {text: {type: 'string'}}}
            },
            output: () => ({type: 'string'}),
          },
        },
      } as const
      yield* transform(service, {portable: {...make(), input: portable}}, {codemode: false})
      const registered = builds

      const first = yield* service.snapshot()
      const second = yield* service.snapshot()

      expect(builds).toBe(registered)
      expect(second.definitions).toHaveLength(1)
      second.definitions.forEach((item, index) => expect(item).toBe(first.definitions[index]))
    }),
  )

  it.effect('skips invalid updates without dropping the existing definition', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: make()}, {codemode: false})
      yield* service.transform((editor) =>
        editor.update('echo', (tool) => {
          Object.assign(tool, {description: undefined})
        }),
      )
      expect((yield* service.snapshot()).definitions[0]?.description).toBe('Echo text')
      expect((yield* executeTool(service, call('echo'))).output).toEqual({text: 'echo'})
    }),
  )

  it.effect('replays empty sources on reload and keeps advertised snapshots', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      let source: Info[] = []
      yield* service.transform((editor) => source.forEach((tool) => editor.add(tool)))
      expect((yield* service.snapshot()).definitions.map((tool) => tool.name)).toEqual([])

      const tool = {...constant('first'), name: 'echo', options: {codemode: false}}
      source = [tool]
      yield* service.reload()
      const advertised = yield* service.snapshot()
      expect((yield* advertised.execute(call('echo'))).output).toEqual({text: 'first'})

      tool.execute = constant('second').execute
      expect((yield* advertised.execute(call('echo'))).output).toEqual({text: 'first'})
      yield* service.reload()
      expect((yield* executeTool(service, call('echo'))).output).toEqual({text: 'second'})
      expect((yield* advertised.execute(call('echo'))).output).toEqual({text: 'first'})

      source = []
      yield* service.reload()
      expect((yield* service.snapshot()).definitions.map((tool) => tool.name)).toEqual([])
      expect((yield* advertised.execute(call('echo'))).output).toEqual({text: 'first'})
    }),
  )

  it.effect('disposes overlays once and replays remaining transforms in order', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const runs: string[] = []
      yield* service.transform((editor) => {
        runs.push('base')
        editor.add({...constant('base'), name: 'echo', options: {codemode: false}})
      })
      const scope = yield* Scope.make()
      const overlay = yield* service
        .transform((editor) => {
          runs.push('overlay')
          editor.add({...constant('overlay'), name: 'echo', options: {codemode: false}})
        })
        .pipe(Scope.provide(scope))
      expect(runs).toEqual(['base', 'base', 'overlay'])
      expect((yield* executeTool(service, call('echo'))).output).toEqual({text: 'overlay'})

      yield* overlay.dispose
      expect(runs).toEqual(['base', 'base', 'overlay', 'base'])
      expect((yield* executeTool(service, call('echo'))).output).toEqual({text: 'base'})
      yield* overlay.dispose
      yield* Scope.close(scope, Exit.void)
      expect(runs).toEqual(['base', 'base', 'overlay', 'base'])
    }),
  )

  it.effect('reads pending tools inside a batch and suppresses terminal teardown replay', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const runs: string[] = []
      const scope = yield* Scope.make()
      yield* State.batch(
        Effect.gen(function* () {
          yield* service.transform((editor) => {
            runs.push('base')
            editor.add({...constant('base'), name: 'echo', options: {codemode: false}})
          })
          yield* service.transform((editor) => {
            runs.push('overlay')
            editor.add({...constant('overlay'), name: 'echo', options: {codemode: false}})
          })
          expect(runs).toEqual([])
          expect((yield* service.snapshot()).definitions.map((tool) => tool.name)).toEqual(['echo'])
          expect(runs).toEqual(['base', 'overlay'])
        }).pipe(Scope.provide(scope)),
      )

      expect(runs).toEqual(['base', 'overlay'])
      expect((yield* executeTool(service, call('echo'))).output).toEqual({text: 'overlay'})
      yield* State.shutdown(Scope.close(scope, Exit.void))
      expect(runs).toEqual(['base', 'overlay'])
    }),
  )

  it.effect('uses the last valid addition on replay and restores earlier transforms on disposal', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo_tool: constant('base')}, {codemode: false})
      let source = [{...constant('overlay'), name: 'echo.tool', options: {codemode: false}}]
      const registration = yield* service.transform((editor) => source.forEach((tool) => editor.add(tool)))
      expect((yield* executeTool(service, call('echo_tool'))).output).toEqual({text: 'overlay'})

      source = [...source, {...constant('collision'), name: 'echo_tool', options: {codemode: false}}]
      yield* service.reload()
      expect((yield* executeTool(service, call('echo_tool'))).output).toEqual({text: 'collision'})

      yield* registration.dispose
      expect((yield* executeTool(service, call('echo_tool'))).output).toEqual({text: 'base'})
      yield* service.transform((editor) => source.forEach((tool) => editor.add(tool)))

      source = [{...constant('invalid'), name: '', options: {codemode: false}}]
      yield* service.reload()
      expect((yield* executeTool(service, call('echo_tool'))).output).toEqual({text: 'base'})
    }),
  )

  it.effect('logs and skips invalid dotted namespaces', () => {
    const output: unknown[] = []
    const logger = Logger.map(Logger.formatStructured, (entry) => {
      output.push(entry.message)
    })
    return Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: make()}, {namespace: 'slack..admin'})

      expect(output).toEqual([
        [
          'Skipping invalid tool registration',
          {name: 'echo', namespace: 'slack..admin', error: 'Invalid tool namespace: "slack..admin"'},
        ],
      ])
      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual([])
    }).pipe(Effect.provide(Logger.layer([logger])))
  })

  it.effect('skips invalid and reserved names while letting the last normalized name win', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(
        service,
        {
          before: make(),
          '': make(),
          'echo.tool': constant('first'),
          echo_tool: constant('last'),
          execute: make(),
          after: make(),
        },
        {codemode: false},
      )
      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['after', 'before', 'echo_tool'])
      expect((yield* snapshot.execute(call('before'))).output).toEqual({text: 'before'})
      expect((yield* snapshot.execute(call('after'))).output).toEqual({text: 'after'})
      expect((yield* snapshot.execute(call('echo_tool'))).output).toEqual({text: 'last'})
    }),
  )

  it.effect('executes native tools without requiring letter-leading names or namespace segments', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(
        service,
        {'2d_get_scene': make(), '123': make(), _lookup: make(), '-lookup': make()},
        {codemode: false},
      )
      yield* transform(service, {'2d_get_scene': make()}, {namespace: '123._private.-tools', codemode: false})

      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['123', '2d_get_scene', '_lookup'])
      for (const name of ['2d_get_scene', '123', '_lookup']) {
        expect((yield* snapshot.execute(call(name))).output).toEqual({text: name})
      }
    }),
  )

  it.effect('keeps healthy tools when another namespace is invalid', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* service.transform((editor) => {
        editor.namespace({name: 'invalid..namespace', description: 'Invalid'})
        editor.add({...make(), name: 'first', options: {codemode: false}})
        editor.add({...make(), name: 'second', options: {namespace: 'invalid..namespace', codemode: false}})
        editor.add({...make(), name: 'second', options: {namespace: 'invalid__namespace'}})
      })

      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['first'])
    }),
  )

  it.effect('logs invalid tool definitions without dropping healthy tools', () => {
    const output: unknown[] = []
    const logger = Logger.map(Logger.formatStructured, (entry) => {
      output.push(entry.message)
    })
    return Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* service.transform((editor) => {
        editor.add({...make(), name: 'healthy', options: {codemode: false}})
        editor.add({
          name: 'phone_type',
          input: Schema.Struct({}),
          execute: () => Effect.succeed({content: 'ok'}),
          options: {codemode: false},
        } as unknown as Info)
        editor.add({...make(), name: 'boolean_input', input: true, options: {codemode: false}} as unknown as Info)
        editor.add({...make(), name: 'codemode'})
      })

      expect(output).toEqual([
        [
          'Skipping invalid tool registration',
          {
            name: 'phone_type',
            namespace: undefined,
            error: expect.stringContaining('Expected string\n  at ["description"]'),
          },
        ],
        [
          'Skipping invalid tool registration',
          {
            name: 'boolean_input',
            namespace: undefined,
            error: 'Invalid tool definition boolean_input: input must be a schema',
          },
        ],
      ])
      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['healthy'])
      expect((yield* snapshot.execute(call('phone_type')).pipe(Effect.flip)).message).toBe(
        'No tool named "phone_type" is currently available. Please use a tool from the available tool list.',
      )
    }).pipe(Effect.provide(Logger.layer([logger])))
  })

  it.effect('skipped registrations leave existing tools and scoped cleanup intact', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: constant('original')}, {codemode: false})
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* service.transform((editor) => {
            editor.add({...constant('invalid'), name: 'echo', description: undefined} as unknown as Info)
            editor.add({...make(), name: 'temporary', options: {codemode: false}})
          })
          const snapshot = yield* service.snapshot()
          expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['echo', 'temporary'])
          expect((yield* snapshot.execute(call('echo'))).output).toEqual({text: 'original'})
        }),
      )
      expect((yield* service.snapshot()).definitions.map((tool) => tool.name)).toEqual(['echo'])
    }),
  )

  it.effect('canonicalizes effective definitions and keeps Code Mode last', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const tool = make()
      const capture = (tools: ReadonlyArray<Info>) =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* service.transform((editor) => tools.forEach(editor.add))
            return (yield* service.snapshot()).definitions
          }),
        )
      const first = yield* capture([
        {...tool, name: 'zeta', options: {codemode: false}},
        {...tool, name: 'alpha', options: {codemode: false}},
        {...tool, name: 'beta', options: {namespace: 'alpha', codemode: false}},
        {...tool, name: 'echo'},
      ])
      const second = yield* capture([
        {...tool, name: 'echo'},
        {...tool, name: 'beta', options: {namespace: 'alpha', codemode: false}},
        {...tool, name: 'alpha', options: {codemode: false}},
        {...tool, name: 'zeta', options: {codemode: false}},
      ])

      expect(first).toEqual(second)
      expect(first.map((definition) => definition.name)).toEqual(['alpha', 'alpha_beta', 'zeta'])
    }),
  )

  it.effect('snapshots external tools with missing input schemas', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* service.transform((editor) =>
        editor.add({
          ...make(),
          input: undefined,
        } as unknown as Info),
      )
      yield* service.transform((editor) =>
        editor.add({...make(), name: 'direct', input: null, options: {codemode: false}} as unknown as Info),
      )

      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['direct'])
      expect((yield* snapshot.execute(call('direct'))).output).toEqual({text: 'direct'})
    }),
  )

  it.effect('exposes Code Mode tools directly when execute is denied', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {lookup: make()}, {namespace: 'mcp'})
      yield* transform(service, {bash: make()}, {codemode: false})
      const denyExecute: Permission.Ruleset = [{action: 'execute', resource: '*', effect: 'deny'}]

      const snapshot = yield* service.snapshot(denyExecute)
      expect(snapshot.definitions.map((tool) => tool.name)).toEqual(['bash', 'mcp_lookup'])
      expect((yield* snapshot.execute(call('mcp_lookup'))).output).toEqual({text: 'mcp_lookup'})

      const hidden = yield* service.snapshot([...denyExecute, {action: 'mcp_lookup', resource: '*', effect: 'deny'}])
      expect(hidden.definitions.map((tool) => tool.name)).toEqual(['bash'])
      expect((yield* hidden.execute(call('mcp_lookup')).pipe(Effect.flip))._tag).toBe('Tool.Error')
    }),
  )

  it.effect('filters disabled tools with edit aliases and ordered wildcard precedence', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {question: make(), bash: make()}, {codemode: false})
      yield* transform(service, {edit: make(), write: make()}, {codemode: false, permission: 'edit'})
      const names = (permissions: Permission.Ruleset) =>
        toolDefinitions(service, permissions).pipe(Effect.map((definitions) => definitions.map((tool) => tool.name)))

      expect(yield* names([{action: 'question', resource: '*', effect: 'deny'}])).toEqual(['bash', 'edit', 'write'])
      expect(
        yield* names([
          {action: '*', resource: '*', effect: 'deny'},
          {action: 'question', resource: 'private', effect: 'allow'},
        ]),
      ).toEqual(['question'])
      expect(
        yield* names([
          {action: 'question', resource: 'private', effect: 'allow'},
          {action: '*', resource: '*', effect: 'deny'},
        ]),
      ).toEqual([])
      expect(yield* names([{action: 'edit', resource: '*', effect: 'deny'}])).toEqual(['bash', 'question'])
    }),
  )

  it.effect('keeps permission options isolated between registrations', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const shared = make()
      yield* transform(service, {first: shared}, {codemode: false})
      yield* transform(service, {second: shared}, {codemode: false, permission: 'edit'})

      expect(
        (yield* toolDefinitions(service, [{action: 'edit', resource: '*', effect: 'deny'}])).map((tool) => tool.name),
      ).toEqual(['first'])
    }),
  )

  it.effect('removes a scoped registration', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const scope = yield* Scope.make()
      yield* transform(service, {echo: make()}, {codemode: false}).pipe(Scope.provide(scope))
      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual(['echo'])
      yield* Scope.close(scope, Exit.void)
      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual([])
    }),
  )

  it.effect('preserves an interrupted registration until its scope closes', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const scope = yield* Scope.make()
      const registered = yield* Deferred.make<void>()
      const fiber = yield* transform(service, {echo: make()}, {codemode: false}).pipe(
        Effect.andThen(Deferred.succeed(registered, undefined)),
        Effect.andThen(Effect.never),
        Scope.provide(scope),
        Effect.forkChild,
      )
      yield* Deferred.await(registered)
      yield* Fiber.interrupt(fiber)

      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual(['echo'])
      yield* Scope.close(scope, Exit.void)
      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual([])
    }),
  )

  it.effect('returns model errors without swallowing interruption or defects', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(
        service,
        {
          failed: {
            name: 'failed',
            description: 'Failed',
            input: Schema.Struct({}),
            output: Schema.Struct({ok: Schema.Boolean}),
            execute: () => Effect.fail(Tool.makeError({message: 'Denied'})),
          },
        },
        {codemode: false},
      )
      expect(
        yield* executeTool(service, {
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'failed', name: 'failed', input: {}},
        }),
      ).toEqual({status: 'error', error: Tool.makeError({message: 'Denied'})})
      expect(
        yield* executeTool(service, {
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'missing', name: 'missing', input: {}},
        }),
      ).toEqual({
        status: 'error',
        error: Tool.makeError({
          message: 'No tool named "missing" is currently available. Please use a tool from the available tool list.',
        }),
      })

      yield* transform(
        service,
        {
          defect: {
            name: 'defect',
            description: 'Defect',
            input: Schema.Struct({}),
            output: Schema.Struct({}),
            execute: () => Effect.die('unexpected executor defect'),
          },
        },
        {codemode: false},
      )
      expect(
        yield* service.snapshot().pipe(
          Effect.flatMap((toolSet) =>
            toolSet.execute({
              sessionId,
              ...identity,
              call: {type: 'tool-call', id: 'defect', name: 'defect', input: {}},
            }),
          ),
          Effect.catchDefect(Effect.succeed),
        ),
      ).toBe('unexpected executor defect')
    }),
  )

  it.effect('exposes execution only through a snapshot', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      expect('definitions' in service).toBe(false)
      expect('execute' in service).toBe(false)
      expect('settle' in service).toBe(false)
      expect(typeof service.snapshot).toBe('function')
    }),
  )

  it.effect('passes complete call identity to tool execution', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const contexts: Tool.Context[] = []
      yield* transform(
        service,
        {
          context: {
            name: 'context',
            description: 'Context',
            input: Schema.Struct({}),
            output: Schema.Struct({ok: Schema.Boolean}),
            execute: (_, context) => Effect.sync(() => contexts.push(context)).pipe(Effect.as({output: {ok: true}})),
          },
        },
        {codemode: false},
      )
      yield* executeTool(service, {
        sessionId,
        ...identity,
        call: {type: 'tool-call', id: 'call-context', name: 'context', input: {}},
      })
      expect(contexts).toEqual([
        {sessionId, ...identity, id: Tool.CallId.make('call-context'), progress: expect.any(Function)},
      ])
    }),
  )
  it.effect('lists registered tools by effective name', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: make()}, {codemode: false})
      yield* transform(service, {count: {...constant('1'), name: 'count'}}, {namespace: 'acme'})

      expect((yield* service.list()).map((tool) => [tool.id, tool.name])).toEqual([
        ['echo', 'echo'],
        ['acme_count', 'count'],
      ])

      yield* service.transform((editor) => editor.remove('echo'))
      expect((yield* service.list()).map((tool) => tool.id)).toEqual(['acme_count'])
    }),
  )
  ;[
    {name: 'string', content: 'hooked', text: 'hooked'},
    {name: 'empty string', content: '', text: ''},
    {name: 'missing content', content: undefined, text: '{"text":"hooked"}'},
    {name: 'empty content array', content: [], text: '{"text":"hooked"}'},
  ].forEach((input) => {
    it.effect(`normalizes ${input.name} after the final tool hook`, () =>
      Effect.gen(function* () {
        const service = yield* Tool.Service
        const hooks = yield* PluginHooks.Service
        yield* transform(service, {echo: make()}, {codemode: false})
        yield* hooks.register('tool', 'execute.after', (event) =>
          Effect.sync(() => {
            if (event.status !== 'completed') return
            event.result = {
              output: {text: 'hooked'},
              content: input.content,
              metadata: {source: 'hook'},
            }
          }),
        )
        const snapshot = yield* service.snapshot()
        expect(yield* snapshot.execute(call('echo'))).toEqual({
          output: {text: 'hooked'},
          content: [{type: 'text', text: input.text}],
          metadata: {source: 'hook'},
        })
      }),
    )
  })

  it.effect('publishes progress metadata unchanged', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(
        service,
        {
          progressive: {
            name: 'progressive',
            description: 'Emit image progress',
            input: Schema.Struct({text: Schema.String}),
            output: Schema.Struct({text: Schema.String}),
            execute: ({text}, context) => context.progress({stage: 'capture'}).pipe(Effect.as({output: {text}})),
          },
        },
        {codemode: false},
      )

      const updates: Tool.Metadata[] = []
      yield* executeTool(service, {
        ...call('progressive'),
        progress: (update) =>
          Effect.sync(() => {
            updates.push(update)
          }),
      })
      expect(updates).toEqual([{stage: 'capture'}])
    }),
  )

  it.effect('enforces transformed codecs at execution and projection boundaries', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const executed: string[] = []
      const Transformed = Schema.Boolean.pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform((value) => (value ? 'yes' : 'no')),
          encode: SchemaGetter.transform((value) => value === 'yes'),
        }),
      )
      yield* transform(
        service,
        {
          transformed: {
            name: 'transformed',
            description: 'Transform values',
            input: Schema.Struct({value: Transformed}),
            output: Schema.Struct({value: Transformed}),
            execute: ({value}) =>
              Effect.sync(() => executed.push(value)).pipe(Effect.as({output: {value}, content: String(value)})),
          },
        },
        {codemode: false},
      )

      expect(
        yield* executeTool(service, {
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'transformed', name: 'transformed', input: {value: true}},
        }),
      ).toEqual({
        status: 'completed',
        output: {value: true},
        content: [{type: 'text', text: 'yes'}],
      })
      expect(executed).toEqual(['yes'])
      expect(
        yield* executeTool(service, {
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'invalid-input', name: 'transformed', input: {value: 'yes'}},
        }),
      ).toMatchObject({
        status: 'error',
        error: Tool.makeError({
          message:
            'Invalid arguments for tool "transformed":\n- value: Expected boolean\n\nArguments provided:\n{\n  "value": "yes"\n}\n\nUpdate the arguments and call the tool again.',
        }),
      })
      expect(executed).toEqual(['yes'])

      yield* transform(
        service,
        {
          invalid_output: {
            name: 'invalid_output',
            description: 'Return invalid output',
            input: Schema.Struct({}),
            output: Schema.Struct({
              value: Schema.Boolean.pipe(
                Schema.decodeTo(Schema.String, {
                  decode: SchemaGetter.transform((value) => String(value)),
                  encode: SchemaGetter.transformEffect((value) =>
                    value === 'valid'
                      ? Effect.succeed(true)
                      : Effect.fail(new SchemaIssue.InvalidValue({message: 'invalid output'}, value)),
                  ),
                }),
              ),
            }),
            execute: () => Effect.succeed({output: {value: 'invalid'}}),
          },
        },
        {codemode: false},
      )
      expect(
        yield* executeTool(service, {
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'invalid-output', name: 'invalid_output', input: {}},
        }),
      ).toMatchObject({
        status: 'error',
        error: {_tag: 'Tool.Error', message: expect.stringContaining('invalid value for its output schema')},
      })
    }),
  )

  it.effect('registers, advertises, and executes a Zod tool', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(
        service,
        {
          zod: {
            name: 'zod',
            description: 'Increment a parsed number',
            input: z.object({count: z.string().transform(Number)}),
            output: z.object({count: z.number()}),
            execute: ({count}) => Effect.succeed({output: {count: count + 1}}),
          },
        },
        {codemode: false},
      )

      const snapshot = yield* service.snapshot()
      expect(snapshot.definitions.find((tool) => tool.name === 'zod')?.inputSchema).toMatchObject({
        type: 'object',
        properties: {count: {type: 'string'}},
        required: ['count'],
      })
      expect(
        yield* snapshot.execute({
          sessionId,
          ...identity,
          call: {type: 'tool-call', id: 'call-zod', name: 'zod', input: {count: '41'}},
        }),
      ).toMatchObject({output: {count: 42}})
    }),
  )

  it.effect('executes the tool advertised in a model request', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      const scope = yield* Scope.make()
      yield* transform(service, {echo: constant('advertised')}, {codemode: false}).pipe(Scope.provide(scope))
      const request = yield* service.snapshot()
      yield* Scope.close(scope, Exit.void)
      yield* transform(service, {echo: constant('replacement')}, {codemode: false})

      expect((yield* request.execute(call('echo'))).content).toEqual([{type: 'text', text: 'advertised'}])
      expect((yield* executeTool(service, call('echo'))).content).toEqual([{type: 'text', text: 'replacement'}])
    }),
  )

  it.effect('reveals the previous registration after an overlay closes', () =>
    Effect.gen(function* () {
      const service = yield* Tool.Service
      yield* transform(service, {echo: constant('base')}, {codemode: false})
      const overlay = yield* Scope.make()
      yield* transform(service, {echo: constant('overlay')}, {codemode: false}).pipe(Scope.provide(overlay))

      expect((yield* executeTool(service, call('echo'))).content).toEqual([{type: 'text', text: 'overlay'}])
      yield* Scope.close(overlay, Exit.void)
      expect((yield* executeTool(service, call('echo'))).content).toEqual([{type: 'text', text: 'base'}])
    }),
  )
})
