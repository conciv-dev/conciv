export * as InstructionState from './instruction-state.js'

import {and, eq, gte, inArray, sql} from 'drizzle-orm'
import {Effect, Option, Schema} from 'effect'
import type {Database} from '../database/database.js'
import type {Bus} from '../bus.js'
import {Instructions} from '../instructions/index.js'
import {SessionEvent} from '../../schema/session-event.js'
import {Session} from '../../schema/session.js'
import {InstructionBlobTable, InstructionStateTable} from './sql.js'

type DatabaseService = Database.Interface['db']

export interface Observation extends Instructions.Admission {
  readonly sessionId: Session.Id
  readonly initial: boolean
  readonly previous: Instructions.Values
  readonly current: Instructions.Values
}

export const observe = Effect.fn('InstructionState.observe')(function* (
  db: DatabaseService,
  instructions: Instructions.List,
  sessionId: Session.Id,
): Effect.fn.Return<Observation, Instructions.InitializationBlocked> {
  const [observed, stored] = yield* Effect.all([Instructions.read(instructions), find(db, sessionId)], {
    concurrency: 'unbounded',
  })
  const result = yield* observeAgainst(observed, stored?.current_values)
  return {
    sessionId,
    initial: !stored,
    previous: stored?.current_values ?? {},
    ...result,
  }
})

export const commit = Effect.fn('InstructionState.commit')(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  instructions: Instructions.List,
  observation: Observation,
) {
  if (!observation.initial && Object.keys(observation.delta).length === 0) return
  const text = observation.initial ? '' : yield* renderUpdateText(db, instructions, observation)
  yield* bus.publish(
    SessionEvent.InstructionsUpdated,
    {
      sessionID: observation.sessionId,
      delta: observation.delta,
      ...(text.length > 0 ? {text} : {}),
    },
    {
      ...(observation.initial ? {metadata: {instructions: {initial: true}}} : {}),
      commit: () => insertBlobs(db, observation.blobs),
    },
  )
})

const renderUpdateText = Effect.fnUntraced(function* (
  db: DatabaseService,
  instructions: Instructions.List,
  observation: Observation,
) {
  const replaced = Object.entries(observation.previous).filter(([key]) => Object.hasOwn(observation.delta, key))
  const blobs = yield* loadBlobs(
    db,
    replaced.map(([, hash]) => hash),
  )
  const previous = Object.fromEntries(replaced.map(([key, hash]) => [key, requireBlob(blobs, hash)]))
  const admitted = new Map(
    Object.entries(observation.blobs).map(([hash, value]) => [Instructions.Hash.make(hash), value]),
  )
  return Instructions.renderUpdate(instructions, previous, dereferenceDelta(observation.delta, admitted))
})

export const prepare = Effect.fn('InstructionState.prepare')(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  instructions: Instructions.List,
  sessionId: Session.Id,
) {
  yield* commit(db, bus, instructions, yield* observe(db, instructions, sessionId))
})

export const apply = Effect.fn('InstructionState.apply')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  seq: number,
  delta: Instructions.Delta,
) {
  const stored = yield* find(db, sessionId)
  const current = Instructions.applyHashDelta(stored?.current_values ?? {}, delta)
  if (!stored) return yield* initialize(db, sessionId, seq, current)
  yield* db
    .update(InstructionStateTable)
    .set({through_seq: seq, current_values: current})
    .where(eq(InstructionStateTable.session_id, sessionId))
    .run()
    .pipe(Effect.orDie)
})

export const initialize = Effect.fn('InstructionState.initialize')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  seq: number,
  values: Instructions.Values,
) {
  yield* db
    .insert(InstructionStateTable)
    .values({
      session_id: sessionId,
      epoch_start: seq,
      through_seq: seq,
      initial_values: values,
      current_values: values,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

export const advanceEpoch = Effect.fn('InstructionState.advanceEpoch')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  epochStart: number,
) {
  yield* db
    .update(InstructionStateTable)
    .set({
      epoch_start: epochStart,
      through_seq: epochStart,
      initial_values: sql`${InstructionStateTable.current_values}`,
    })
    .where(eq(InstructionStateTable.session_id, sessionId))
    .run()
    .pipe(Effect.orDie)
})

export const rewind = Effect.fn('InstructionState.rewind')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  boundary: number,
) {
  yield* db
    .delete(InstructionStateTable)
    .where(and(eq(InstructionStateTable.session_id, sessionId), gte(InstructionStateTable.through_seq, boundary)))
    .run()
    .pipe(Effect.orDie)
})

export const initial = Effect.fn('InstructionState.initial')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  instructions: Instructions.List,
) {
  const state = yield* find(db, sessionId)
  if (!state) return yield* Effect.die(new Error(`Instruction state not found during assembly: ${sessionId}`))
  const blobs = yield* loadBlobs(db, Object.values(state.initial_values))
  return Instructions.renderInitial(instructions, dereference(state.initial_values, blobs))
})

export const current = Effect.fn('InstructionState.current')(function* (db: DatabaseService, sessionId: Session.Id) {
  return (yield* find(db, sessionId))?.current_values
})

export const preview = Effect.fn('InstructionState.preview')(function* (
  db: DatabaseService,
  sessionId: Session.Id,
  instructions: Instructions.List,
  observed: Instructions.ReadResult,
) {
  const state = yield* find(db, sessionId)
  const result = yield* observeAgainst(observed, state?.current_values)
  const observedBlobs = new Map<Instructions.Hash, Schema.Json>(
    Object.entries(result.blobs).map(([hash, value]) => [Instructions.Hash.make(hash), value]),
  )
  if (!state) {
    const values = dereference(result.current, observedBlobs)
    return {initial: Instructions.renderInitial(instructions, values), update: ''}
  }
  const stored = yield* loadBlobs(db, [...Object.values(state.initial_values), ...Object.values(state.current_values)])
  return {
    initial: Instructions.renderInitial(instructions, dereference(state.initial_values, stored)),
    update: Instructions.renderUpdate(
      instructions,
      dereference(state.current_values, stored),
      dereferenceDelta(result.delta, observedBlobs),
    ),
  }
})

const observeAgainst = Effect.fnUntraced(function* (observed: Instructions.ReadResult, previous?: Instructions.Values) {
  const admission = yield* Instructions.diff(observed, previous)
  return {
    current: Instructions.applyHashDelta(previous ?? {}, admission.delta),
    ...admission,
  }
})

const find = Effect.fnUntraced(function* (db: DatabaseService, sessionId: Session.Id) {
  return yield* db
    .select()
    .from(InstructionStateTable)
    .where(eq(InstructionStateTable.session_id, sessionId))
    .get()
    .pipe(Effect.orDie)
})

const insertBlobs = Effect.fnUntraced(function* (db: DatabaseService, blobs: Readonly<Record<string, Schema.Json>>) {
  const rows = Object.entries(blobs).map(([hash, value]) => ({hash: Instructions.Hash.make(hash), value}))
  if (rows.length === 0) return
  yield* db.insert(InstructionBlobTable).values(rows).onConflictDoNothing().run().pipe(Effect.orDie)
})

const loadBlobs = Effect.fnUntraced(function* (db: DatabaseService, values: ReadonlyArray<Instructions.Hash>) {
  const hashes = [...new Set(values)]
  const batches = Array.from({length: Math.ceil(hashes.length / 500)}, (_, index) =>
    hashes.slice(index * 500, (index + 1) * 500),
  )
  const rows = (yield* Effect.forEach(
    batches,
    (batch) =>
      db.select().from(InstructionBlobTable).where(inArray(InstructionBlobTable.hash, batch)).all().pipe(Effect.orDie),
    {concurrency: 4},
  )).flat()
  const blobs = new Map(rows.map((row) => [row.hash, row.value]))
  for (const hash of hashes) {
    if (!blobs.has(hash)) return yield* Effect.die(new Error(`Instruction blob not found: ${hash}`))
  }
  return blobs
})

function dereference(
  values: Instructions.Values,
  blobs: ReadonlyMap<Instructions.Hash, Schema.Json>,
): Readonly<Record<string, Schema.Json>> {
  return Object.fromEntries(Object.entries(values).map(([key, hash]) => [key, requireBlob(blobs, hash)]))
}

function dereferenceDelta(
  delta: Instructions.Delta,
  blobs: ReadonlyMap<Instructions.Hash, Schema.Json>,
): Readonly<Record<string, Option.Option<Schema.Json>>> {
  return Object.fromEntries(
    Object.entries(delta).map(([key, hash]) => [
      key,
      hash === 'removed' ? Option.none() : Option.some(requireBlob(blobs, hash)),
    ]),
  )
}

function requireBlob(blobs: ReadonlyMap<Instructions.Hash, Schema.Json>, hash: Instructions.Hash) {
  const value = blobs.get(hash)
  if (value === undefined) throw new Error(`Instruction blob not found: ${hash}`)
  return value
}
