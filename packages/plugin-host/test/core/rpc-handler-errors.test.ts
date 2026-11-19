import {describe, expect, test} from 'vitest'
import {Cause, Context, Effect, Exit, Layer, Logger, Schema} from 'effect'
import {openDb} from '@conciv/db'
import {SqliteClient} from '@effect/sql-sqlite-node'
import * as PluginHostEntry from '../../src/index.js'
import {Bus} from '../../src/core/bus.js'
import {Database} from '../../src/core/database/database.js'
import {Location} from '../../src/core/location.js'
import {Rpc} from '../../src/core/rpc.js'
import {Project} from '../../src/schema/project.js'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
import {tmpdirScoped} from './fixture/tmpdir'
import {testEffect} from './lib/effect'

const database = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const db = yield* openDb(tmp.path)
    return Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, db.$client))
  }),
)

const location = Layer.succeed(
  Location.Service,
  Location.Service.of({
    directory: AbsolutePath.make('/rpc-project'),
    project: {
      id: Project.Id.make('/rpc-project'),
      directory: AbsolutePath.make('/rpc-project'),
      canonical: AbsolutePath.make('/rpc-project'),
    },
  }),
)

const it = testEffect(
  Rpc.layer.pipe(Layer.provideMerge(Bus.layer), Layer.provideMerge(location), Layer.provideMerge(database)),
)
const Broken = Rpc.define({
  id: 'broken',
  methods: {
    dies: {input: Schema.Undefined, output: Schema.String},
    throws: {input: Schema.Undefined, output: Schema.String},
    raw: {input: Schema.Undefined, output: Schema.String},
    undeclared: {input: Schema.Undefined, output: Schema.String},
    invalidError: {
      input: Schema.Undefined,
      output: Schema.String,
      errors: {known: Schema.Struct({count: Schema.Int})},
    },
  },
  events: {},
})

for (const method of ['dies', 'throws', 'raw', 'undeclared', 'invalidError'] as const) {
  it.effect(`recovers from ${method} through the typed rpc.internal failure`, () =>
    Effect.gen(function* () {
      const rpc = yield* Rpc.Service
      yield* rpc.register(Broken, {
        dies: () => Effect.die(new Error('handler defect')),
        throws: () => {
          throw new Error('handler threw')
        },
        // @ts-expect-error
        raw: () => Effect.fail(new Error('raw failure')),
        // @ts-expect-error
        undeclared: (_input, context) => Effect.fail(context.error('unknown', 'Unknown')),
        invalidError: (_input, context) => Effect.fail(context.error('known', 'Invalid count', {count: 1.5})),
      })
      const logged: unknown[] = []
      const result = yield* rpc
        .client(Broken)
        [method]()
        .pipe(
          Effect.catchIf(
            (error) => 'type' in error && error.type === 'rpc.internal',
            (error) => Effect.succeed(error),
          ),
          Effect.provideService(Logger.CurrentLoggers, new Set([Logger.make((entry) => logged.push(entry.message))])),
        )
      expect(result).toEqual({type: 'rpc.internal', message: 'RPC call failed'})
      expect(logged).toHaveLength(1)
    }),
  )
}

describe('a service the consumer forgot to provide', () => {
  test('is named under the conciv scope, never another project scope, in the error the consumer sees', () => {
    const services = Object.values(PluginHostEntry)
      .flatMap((namespace) => Object.values(namespace))
      .filter(Context.isKey)
      .filter((service) => !Context.isReference(service))
    const messages = services.map((service) => {
      const exit = Effect.runSyncExit(Effect.map(Effect.context(), (context) => Context.getUnsafe(context, service)))
      return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ''
    })
    expect(messages.length).toBeGreaterThan(20)
    expect(messages.filter((message) => !message.includes('Service not found: '))).toEqual([])
    expect(messages.filter((message) => /Service not found: @(?!conciv\/)/.test(message))).toEqual([])
  })
})
