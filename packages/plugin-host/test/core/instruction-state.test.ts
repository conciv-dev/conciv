import {describe, expect} from 'vitest'
import {and, asc, eq} from 'drizzle-orm'
import {Effect, Layer, Schema} from 'effect'
import {Database} from '../../src/core/database/database.js'
import {Bus} from '../../src/core/bus.js'
import {Event} from '../../src/schema/event.js'
import {EventTable} from '../../src/core/event/sql.js'
import {Instructions} from '../../src/core/instructions/index.js'
import {InstructionState} from '../../src/core/session/instruction-state.js'
import {SessionProjector} from '../../src/core/session/projector.js'
import {Session} from '../../src/schema/session.js'
import {InstructionBlobTable, InstructionStateTable, SessionTable} from '../../src/core/session/sql.js'
import {databaseLayer} from './fixture/permission'
import {testEffect} from './lib/effect'

const it = testEffect(
  SessionProjector.layer.pipe(Layer.provideMerge(Bus.configured({persist: true})), Layer.provideMerge(databaseLayer)),
)

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

  it.effect('commits initial metadata and changed and removed deltas without rereading sources', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_commit')
      const {db, events} = yield* setup(sessionId)
      let current = 'initial'
      let retired: string | Instructions.Removed = 'retired'
      let reads = 0
      const instructions = Instructions.combine([
        source(
          'test/current',
          Effect.sync(() => {
            reads++
            return current
          }),
        ),
        source(
          'test/retired',
          Effect.sync(() => {
            reads++
            return retired
          }),
        ),
      ])
      const published: Event.Payload[] = []
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === 'session.instructions.updated') published.push(event)
        }),
      )

      const initial = yield* InstructionState.observe(db, instructions, sessionId)
      expect(reads).toBe(2)
      yield* InstructionState.commit(db, events, instructions, initial)
      expect(reads).toBe(2)

      current = 'changed'
      retired = Instructions.removed
      const changed = yield* InstructionState.observe(db, instructions, sessionId)
      expect(reads).toBe(4)
      expect(changed).toMatchObject({
        sessionId,
        initial: false,
        previous: {
          'test/current': Instructions.hash('initial'),
          'test/retired': Instructions.hash('retired'),
        },
        current: {'test/current': Instructions.hash('changed')},
        delta: {
          'test/current': Instructions.hash('changed'),
          'test/retired': 'removed',
        },
        blobs: {[Instructions.hash('changed')]: 'changed'},
      })
      yield* InstructionState.commit(db, events, instructions, changed)
      expect(reads).toBe(4)
      yield* unsubscribe

      expect(published).toHaveLength(2)
      expect(published[0]?.metadata).toEqual({instructions: {initial: true}})
      expect(published[1]?.metadata).toBeUndefined()
      expect((yield* instructionEvents(db, sessionId)).map((event) => event.data.delta)).toEqual([
        {
          'test/current': Instructions.hash('initial'),
          'test/retired': Instructions.hash('retired'),
        },
        {
          'test/current': Instructions.hash('changed'),
          'test/retired': 'removed',
        },
      ])
      expect((yield* instructionEvents(db, sessionId)).map((event) => event.data.text)).toEqual([
        undefined,
        'changed\n\nRemoved retired',
      ])
      expect(yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)).toMatchObject({
        initial_values: {
          'test/current': Instructions.hash('initial'),
          'test/retired': Instructions.hash('retired'),
        },
        current_values: {'test/current': Instructions.hash('changed')},
      })
      expect(
        Object.fromEntries(
          (yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).map((row) => [row.hash, row.value]),
        ),
      ).toEqual({
        [Instructions.hash('initial')]: 'initial',
        [Instructions.hash('retired')]: 'retired',
        [Instructions.hash('changed')]: 'changed',
      })
    }),
  )

  it.effect('keeps no-op observations free of events and blobs', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_noop')
      const {db, events} = yield* setup(sessionId)
      const instructions = source('test/context', Effect.succeed('unchanged'))
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      const beforeEvents = yield* instructionEvents(db, sessionId)
      const beforeBlobs = yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)

      const observation = yield* InstructionState.observe(db, instructions, sessionId)
      expect(observation).toEqual({
        sessionId,
        initial: false,
        previous: {'test/context': Instructions.hash('unchanged')},
        current: {'test/context': Instructions.hash('unchanged')},
        delta: {},
        blobs: {},
      })
      yield* InstructionState.commit(db, events, instructions, observation)

      expect(yield* instructionEvents(db, sessionId)).toEqual(beforeEvents)
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual(beforeBlobs)
    }),
  )

  it.effect('treats a missing state row as a fresh baseline without repairing it', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate')
      const {db, events} = yield* setup(sessionId)
      let value = 'Initial context'
      const instructions = source(
        'test/context',
        Effect.sync(() => value),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      yield* db
        .delete(InstructionStateTable)
        .where(eq(InstructionStateTable.session_id, sessionId))
        .run()
        .pipe(Effect.orDie)
      value = 'Changed context'
      const beforeEvents = yield* instructionEvents(db, sessionId)
      const beforeBlobs = yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)

      const assembled = yield* preview(db, sessionId, instructions)

      expect(assembled).toEqual({
        initial: [{key: Instructions.Key.make('test/context'), text: 'Changed context'}],
        update: '',
      })
      expect(yield* instructionEvents(db, sessionId)).toEqual(beforeEvents)
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual(beforeBlobs)
      expect(
        yield* db
          .select()
          .from(InstructionStateTable)
          .where(eq(InstructionStateTable.session_id, sessionId))
          .get()
          .pipe(Effect.orDie),
      ).toBeUndefined()
    }),
  )

  it.effect('trusts the projected state without consulting durable events', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate_stale')
      const {db, events} = yield* setup(sessionId)
      let value = 'Initial context'
      const instructions = source(
        'test/context',
        Effect.sync(() => value),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      value = 'Committed update'
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      yield* db
        .update(InstructionStateTable)
        .set({through_seq: 0, current_values: {'test/context': Instructions.hash('Initial context')}})
        .where(eq(InstructionStateTable.session_id, sessionId))
        .run()
        .pipe(Effect.orDie)
      value = 'Private update'
      const beforeEvents = yield* instructionEvents(db, sessionId)
      const beforeBlobs = yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)
      const beforeState = yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)

      const assembled = yield* preview(db, sessionId, instructions)

      expect(assembled.initial).toEqual([{key: Instructions.Key.make('test/context'), text: 'Initial context'}])
      expect(assembled.update).toBe('Private update')
      expect(yield* instructionEvents(db, sessionId)).toEqual(beforeEvents)
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual(beforeBlobs)
      expect(yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)).toEqual(beforeState)
    }),
  )

  it.effect('previews changed and removed instructions from observed blobs', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate_delta')
      const {db, events} = yield* setup(sessionId)
      let current = 'Initial context'
      let retired: string | Instructions.Removed = 'Retired context'
      const instructions = Instructions.combine([
        source(
          'test/current',
          Effect.sync(() => current),
        ),
        source(
          'test/retired',
          Effect.sync(() => retired),
        ),
      ])
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      current = 'Changed context'
      retired = Instructions.removed

      const assembled = yield* preview(db, sessionId, instructions)

      expect(assembled.initial).toEqual([
        {key: Instructions.Key.make('test/current'), text: 'Initial context'},
        {key: Instructions.Key.make('test/retired'), text: 'Retired context'},
      ])
      expect(assembled.update).toContain('Changed context')
      expect(assembled.update).toContain('Removed Retired context')
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

  it.effect('retains a committed value when fresh instructions are unavailable', () =>
    Effect.gen(function* () {
      const sessionId = Session.Id.make('conciv_instruction_generate_unavailable')
      const {db, events} = yield* setup(sessionId)
      let value: string | Instructions.Unavailable = 'Committed context'
      const instructions = source(
        'test/context',
        Effect.sync(() => value),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionId)
      value = Instructions.unavailable
      const beforeEvents = yield* instructionEvents(db, sessionId)
      const beforeBlobs = yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)
      const beforeState = yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)

      expect(yield* preview(db, sessionId, instructions)).toEqual({
        initial: [{key: Instructions.Key.make('test/context'), text: 'Committed context'}],
        update: '',
      })
      expect(yield* instructionEvents(db, sessionId)).toEqual(beforeEvents)
      expect(yield* db.select().from(InstructionBlobTable).all().pipe(Effect.orDie)).toEqual(beforeBlobs)
      expect(yield* db.select().from(InstructionStateTable).get().pipe(Effect.orDie)).toEqual(beforeState)
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

  it.effect('keeps prepare equivalent to observe followed by commit', () =>
    Effect.gen(function* () {
      const observedSessionId = Session.Id.make('conciv_instruction_composed')
      const preparedSessionId = Session.Id.make('conciv_instruction_prepared')
      const {db, events} = yield* setup(observedSessionId)
      yield* setup(preparedSessionId)
      let value: string | Instructions.Removed = 'initial'
      let observedReads = 0
      let preparedReads = 0
      const observedInstructions = source(
        'test/context',
        Effect.sync(() => {
          observedReads++
          return value
        }),
      )
      const preparedInstructions = source(
        'test/context',
        Effect.sync(() => {
          preparedReads++
          return value
        }),
      )

      for (const next of ['initial', 'changed', 'changed', Instructions.removed] as const) {
        value = next
        yield* InstructionState.observe(db, observedInstructions, observedSessionId).pipe(
          Effect.flatMap((observation) => InstructionState.commit(db, events, observedInstructions, observation)),
        )
        yield* InstructionState.prepare(db, events, preparedInstructions, preparedSessionId)
      }

      expect(observedReads).toBe(4)
      expect(preparedReads).toBe(4)
      expect((yield* instructionEvents(db, observedSessionId)).map((event) => event.data.delta)).toEqual(
        (yield* instructionEvents(db, preparedSessionId)).map((event) => event.data.delta),
      )
      const states = yield* db.select().from(InstructionStateTable).orderBy(asc(InstructionStateTable.session_id)).all()
      expect(states).toHaveLength(2)
      expect(
        states.map((state) => ({
          epoch_start: state.epoch_start,
          through_seq: state.through_seq,
          initial_values: state.initial_values,
          current_values: state.current_values,
        })),
      ).toEqual([
        {
          epoch_start: 0,
          through_seq: 2,
          initial_values: {'test/context': Instructions.hash('initial')},
          current_values: {},
        },
        {
          epoch_start: 0,
          through_seq: 2,
          initial_values: {'test/context': Instructions.hash('initial')},
          current_values: {},
        },
      ])
    }),
  )
})
