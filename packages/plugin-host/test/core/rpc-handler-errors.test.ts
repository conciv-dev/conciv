import {expect} from 'vitest'
import {Effect, Layer, Logger, Schema} from 'effect'
import {openDb} from '@conciv/db'
import {Bus} from '../../src/core/bus.js'
import {Database} from '../../src/core/database/database.js'
import {Location} from '../../src/core/location.js'
import {Rpc} from '../../src/core/rpc.js'
import {AbsolutePath} from '../../src/schema/schema.js'
import {tmpdirScoped} from './fixture/tmpdir'
import {testEffect} from './lib/effect'

const database = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const client = openDb(tmp.path).$client
    const path = client.location() ?? undefined
    client.close()
    return Database.layer({path})
  }),
)

const location = Layer.succeed(Location.Service, Location.Service.of({directory: AbsolutePath.make('/rpc-project')}))

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
