import {describe, expect} from 'vitest'
import {and, asc, eq} from 'drizzle-orm'
import {Effect, Layer, Schema} from 'effect'
import {Database} from '../../src/core/database/database.js'
import {Bus} from '../../src/core/bus.js'
import {Event} from '../../src/schema/event.js'
import {EventTable} from '../../src/core/event/sql.js'
import {Instructions} from '../../src/core/instructions/index.js'
import {InstructionState} from '../../src/core/session/instruction-state.js'
import {Session} from '../../src/schema/session.js'
import {InstructionBlobTable, InstructionStateTable, SessionTable} from '../../src/core/session/sql.js'
import {databaseLayer} from './fixture/permission'
import {testEffect} from './lib/effect'

const it = testEffect(Bus.configured({persist: true}).pipe(Layer.provideMerge(databaseLayer)))

const source = (name: string, read: Effect.Effect<string | Instructions.Unavailable | Instructions.Removed>) =>
  Instructions.make({
    key: Instructions.Key.make(name),
    codec: Schema.toCodecJson(Schema.String),
    read,
    render: {
      initial: String,
      changed: (_previous, current) => current,
      removed: (previous) => `Removed ${previous}`,
    },
  })

const setup = (sessionId: Session.Id) =>
  Effect.gen(function* () {
    const {db} = yield* Database.Service
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionId,
        harnessKind: 'test',
        origin: 'chat',
        title: 'Instruction state test',
        cwd: '/project',
        createdAt: 0,
        updatedAt: 0,
      })
      .run()
      .pipe(Effect.orDie)
    return {db, events: yield* Bus.Service}
  })

const instructionEvents = (db: Database.Interface['db'], sessionId: Session.Id) =>
  db
    .select()
    .from(EventTable)
    .where(and(eq(EventTable.aggregate_id, sessionId), eq(EventTable.type, 'session.instructions.updated.2')))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)

const preview = (db: Database.Interface['db'], sessionId: Session.Id, instructions: Instructions.List) =>
  Instructions.read(instructions).pipe(
    Effect.flatMap((observed) => InstructionState.preview(db, sessionId, instructions, observed)),
  )

describe('InstructionState', () => {
  it.effect('observes each source once without publishing events or inserting blobs', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_observe')
      const {db, events} = yield* setup(sessionId)
      const reads = {first: 0, second: 0}
      const instructions = Instructions.combine([
        source(
          'test/first',
          Effect.sync(() => {
            reads.first++
            return 'first'
          }),
        ),
        source(
          'test/second',
          Effect.sync(() => {
            reads.second++
            return 'second'
          }),
        ),
      ])
      const published: Event.Payload[] = []
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === 'session.instructions.updated') published.push(event)
        }),
      )

      const observation = yield* InstructionState.observe(db, instructions, sessionId)
      yield* unsubscribe

      expect(reads).toEqual({first: 1, second: 1})
      expect(observation).toEqual({
        sessionId,
        initial: true,
        previous: {},
        current: {
          'test/first': Instructions.hash('first'),
          'test/second': Instructions.hash('second'),
        },
        delta: {
          'test/first': Instructions.hash('first'),
          'test/second': Instructions.hash('second'),
        },
        blobs: {
          [Instructions.hash('first')]: 'first',
          [Instructions.hash('second')]: 'second',
        },
      })
      expect(published).toEqual([])
      expect(yield* instructionEvents(db, sessionId)).toEqual([])
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual([])
    }),
  )

  it.effect('assembles initial instructions without persisting a baseline', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate_initial')
      const {db} = yield* setup(sessionId)
      const instructions = source('test/context', Effect.succeed('Initial context'))

      expect(yield* preview(db, sessionId, instructions)).toEqual({
        initial: [{key: Instructions.Key.make('test/context'), text: 'Initial context'}],
        update: '',
      })
      expect(yield* instructionEvents(db, sessionId)).toEqual([])
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual([])
      expect(yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)).toBeUndefined()
    }),
  )

  it.effect('blocks an unavailable initial instruction without persisting a baseline', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate_blocked')
      const {db} = yield* setup(sessionId)
      const instructions = source('test/context', Effect.succeed(Instructions.unavailable))

      const error = yield* preview(db, sessionId, instructions).pipe(Effect.flip)

      expect(error._tag).toBe('Instructions.InitializationBlocked')
      expect(error.keys).toEqual([Instructions.Key.make('test/context')])
      expect(yield* instructionEvents(db, sessionId)).toEqual([])
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual([])
      expect(yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)).toBeUndefined()
    }),
  )
})
