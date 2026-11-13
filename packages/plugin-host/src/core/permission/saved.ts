export * as PermissionSaved from './saved.js'

import {eq} from 'drizzle-orm'
import {Cause, Context, DateTime, Effect, Layer, Schema} from 'effect'
import {isSqlError} from 'effect/sql/SqlError'
import type {EffectDrizzleQueryError} from 'drizzle-orm/effect-core/errors'
import type {Project} from '../../schema/project.js'
import {Database} from '../database/database.js'
import {PermissionTable} from './sql.js'
import {PermissionSaved} from '../../schema/permission-saved.js'

export const Id = PermissionSaved.Id
export type Id = typeof Id.Type

export const Info = PermissionSaved.Info
export type Info = typeof Info.Type

export interface ListInput {
  readonly projectId?: Project.Id
}

export interface AddInput {
  readonly projectId: Project.Id
  readonly action: string
  readonly resources: readonly string[]
}

export interface UpdateInput {
  readonly id: Id
  readonly action?: string
  readonly resource?: string
}

export const NotFoundError = Schema.TaggedStruct('PermissionSaved.NotFoundError', {
  id: Id,
})
export type NotFoundError = typeof NotFoundError.Type & globalThis.Error

export const makeNotFoundError = (fields: Omit<typeof NotFoundError.Type, '_tag'>): NotFoundError =>
  Object.assign(new globalThis.Error(), NotFoundError.make(fields), {name: 'PermissionSaved.NotFoundError'})

export const ConflictError = Schema.TaggedStruct('PermissionSaved.ConflictError', {
  id: Id,
  action: Schema.String,
  resource: Schema.String,
})
export type ConflictError = typeof ConflictError.Type & globalThis.Error

export const makeConflictError = (fields: Omit<typeof ConflictError.Type, '_tag'>): ConflictError =>
  Object.assign(new globalThis.Error(), ConflictError.make(fields), {name: 'PermissionSaved.ConflictError'})

export interface Interface {
  readonly list: (input?: ListInput) => Effect.Effect<ReadonlyArray<Info>>
  readonly add: (input: AddInput) => Effect.Effect<void>
  readonly update: (input: UpdateInput) => Effect.Effect<Info, NotFoundError | ConflictError>
  readonly remove: (id: Id) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@opencode/PermissionSaved')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const list = Effect.fnUntraced(function* (input?: ListInput) {
      const rows = yield* db
        .select()
        .from(PermissionTable)
        .where(input?.projectId ? eq(PermissionTable.project_id, input.projectId) : undefined)
        .all()
        .pipe(Effect.orDie)
      return rows.map(info)
    })

    const add = Effect.fn('PermissionSaved.add')(function* (input: AddInput) {
      if (!input.resources.length) return
      yield* db
        .insert(PermissionTable)
        .values(
          input.resources.map((resource) => ({
            id: Id.create(),
            project_id: input.projectId,
            action: input.action,
            resource,
          })),
        )
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
    })

    const update = Effect.fn('PermissionSaved.update')(function* (input: UpdateInput) {
      const current = yield* db
        .select()
        .from(PermissionTable)
        .where(eq(PermissionTable.id, input.id))
        .get()
        .pipe(Effect.orDie)
      if (!current) return yield* Effect.fail(makeNotFoundError({id: input.id}))
      const action = input.action ?? current.action
      const resource = input.resource ?? current.resource
      const updated = yield* db
        .update(PermissionTable)
        .set({action, resource})
        .where(eq(PermissionTable.id, input.id))
        .returning()
        .get()
        .pipe(
          Effect.catchIf(isUniqueViolation, () => Effect.fail(makeConflictError({id: input.id, action, resource}))),
          Effect.catchTag('EffectDrizzleQueryError', (error) => Effect.die(error)),
        )
      if (!updated) return yield* Effect.fail(makeNotFoundError({id: input.id}))
      return info(updated)
    })

    const remove = Effect.fn('PermissionSaved.remove')(function* (id: Id) {
      yield* db.delete(PermissionTable).where(eq(PermissionTable.id, id)).run().pipe(Effect.orDie)
    })

    return Service.of({list, add, update, remove})
  }),
)

const isUniqueViolation = (error: EffectDrizzleQueryError) => {
  const sql = Cause.isCause(error.cause) ? Cause.squash(error.cause) : error.cause
  if (!isSqlError(sql)) return false
  return (
    sql.reason._tag === 'UniqueViolation' ||
    (sql.reason.cause instanceof Error && sql.reason.cause.message.includes('SQLITE_CONSTRAINT_UNIQUE'))
  )
}

const info = (row: typeof PermissionTable.$inferSelect): Info => ({
  id: row.id,
  projectId: row.project_id,
  action: row.action,
  resource: row.resource,
  time: {
    created: DateTime.makeUnsafe(row.time_created),
    updated: DateTime.makeUnsafe(row.time_updated),
  },
})
