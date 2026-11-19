import {describe, expect} from 'vitest'
import {Effect, Layer, Schema, SchemaTransformation} from 'effect'
import {openDb} from '@conciv/db'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {Bus} from '../../src/core/bus.js'
import {Database} from '../../src/core/database/database.js'
import {Event} from '@conciv/plugin/schema/event'
import {tmpdirScoped} from './fixture/tmpdir'
import {testEffect} from './lib/effect'

const databaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const db = yield* openDb(tmp.path)
    return Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, db.$client))
  }),
)

const it = testEffect(Bus.layer.pipe(Layer.provideMerge(databaseLayer)))

let encodes = 0
const Counted = Bus.durable({
  type: 'test.counted',
  durable: {version: 1, aggregate: 'id'},
  schema: {
    id: Schema.String,
    text: Schema.String.pipe(
      Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transform({
          decode: (value: string) => value,
          encode: (value: string) => {
            encodes++
            return value
          },
        }),
      ),
    ),
  },
})

describe('Bus without persistence', () => {
  it.effect('does not encode payloads it does not store', () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      encodes = 0

      const first = yield* bus.publish(Counted, {id: 'counted', text: 'one'})
      yield* bus.publishAll([
        [Counted, {id: 'counted', text: 'two'}],
        [Counted, {id: 'counted', text: 'three'}],
      ])

      expect(first.durable?.seq).toBe(Event.Seq.make(0))
      expect(encodes).toBe(0)
    }),
  )
})
