import {describe, expect} from 'vitest'
import {Effect, Fiber, Layer, Stream} from 'effect'
import {eq} from 'drizzle-orm'
import {openDb} from '@conciv/db'
import {Bus} from '../../src/core/bus.js'
import {Database} from '../../src/core/database/database.js'
import {Location} from '../../src/core/location.js'
import {SessionTable} from '../../src/core/session/sql.js'
import type {Event} from '../../src/schema/event.js'
import {AbsolutePath} from '../../src/schema/schema.js'
import {SessionEvent} from '../../src/schema/session-event.js'
import {SessionId} from '../../src/schema/session-id.js'
import {WorkspaceId} from '../../src/schema/workspace-id.js'
import {tmpdirScoped} from './fixture/tmpdir'
import {testEffect} from './lib/effect'

const databaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const db = openDb(tmp.path)
    const file = db.$client.location()
    db.$client.close()
    if (!file) return yield* Effect.die(new Error('openDb returned an in-memory database'))
    return Database.layer({path: file})
  }),
)

const engine = Location.Service.of({directory: AbsolutePath.make('project'), workspaceId: WorkspaceId.make('wrk_test')})
const elsewhere = Location.Service.of({directory: AbsolutePath.make('elsewhere')})

const it = testEffect(
  Bus.configured({persist: true}).pipe(
    Layer.provide(Layer.succeed(Location.Service, engine)),
    Layer.provideMerge(databaseLayer),
  ),
)

const Done = Bus.ephemeral({type: 'test.routing.done', schema: {}})
const owned = SessionId.make('conciv_routing')
const unknown = SessionId.make('conciv_unknown')

const watch = (bus: Bus.Interface, location?: Location.Interface) => {
  const collect = bus.subscribe().pipe(
    Stream.takeUntil((event) => event.type === Done.type),
    Stream.filter((event) => event.type !== Done.type),
    Stream.runCollect,
  )
  return (location ? collect.pipe(Effect.provideService(Location.Service, location)) : collect).pipe(
    Effect.forkScoped({startImmediately: true}),
  )
}

const step = <A extends Event.Payload>(bus: Bus.Interface, publish: Effect.Effect<A>) =>
  Effect.gen(function* () {
    const atEngine = yield* watch(bus, engine)
    const atElsewhere = yield* watch(bus, elsewhere)
    const everywhere = yield* watch(bus)
    const event = yield* publish
    yield* bus.publish(Done, {})
    return {
      event,
      atEngine: yield* Fiber.join(atEngine),
      atElsewhere: yield* Fiber.join(atElsewhere),
      everywhere: yield* Fiber.join(everywhere),
    }
  })

describe('Bus Session routing', () => {
  it.effect('routes session events to the engine location through the session row', () =>
    Effect.gen(function* () {
      const {db} = yield* Database.Service
      yield* db
        .insert(SessionTable)
        .values({id: owned, harnessKind: 'test', origin: 'chat', cwd: 'project', createdAt: 0, updatedAt: 0})
        .run()
      const bus = yield* Bus.Service

      const renamed = yield* step(bus, bus.publish(SessionEvent.Renamed, {sessionID: owned, title: 'first'}))
      expect(renamed.event).not.toHaveProperty('location')
      expect(renamed.atEngine).toEqual([renamed.event])
      expect(renamed.atElsewhere).toEqual([])
      expect(renamed.everywhere).toEqual([renamed.event])

      const explicit = yield* step(
        bus,
        bus.publish(SessionEvent.Execution.Succeeded, {sessionID: owned}, {location: elsewhere}),
      )
      expect(explicit.event.location).toEqual(elsewhere)
      expect(explicit.atEngine).toEqual([])
      expect(explicit.atElsewhere).toEqual([explicit.event])
      expect(explicit.everywhere).toEqual([explicit.event])

      const orphan = yield* step(bus, bus.publish(SessionEvent.Renamed, {sessionID: unknown, title: 'nobody'}))
      expect(orphan.atEngine).toEqual([])
      expect(orphan.atElsewhere).toEqual([])
      expect(orphan.everywhere).toEqual([orphan.event])

      const deleted = yield* step(bus, bus.publish(SessionEvent.Deleted, {sessionID: owned}))
      expect(deleted.atEngine).toEqual([deleted.event])
      expect(deleted.atElsewhere).toEqual([])
      expect(deleted.everywhere).toEqual([deleted.event])

      yield* db.delete(SessionTable).where(eq(SessionTable.id, owned)).run()
      const after = yield* step(bus, bus.publish(SessionEvent.Renamed, {sessionID: owned, title: 'after'}))
      expect(after.atEngine).toEqual([])
      expect(after.atElsewhere).toEqual([])
      expect(after.everywhere).toEqual([after.event])
    }),
  )
})
