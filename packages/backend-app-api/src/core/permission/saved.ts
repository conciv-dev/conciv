import {eq} from 'drizzle-orm'
import {Cause, Context, DateTime, Effect, Layer} from 'effect'
import type {EvlogError} from 'evlog'
import {isSqlError} from 'effect/sql/SqlError'
import type {EffectDrizzleQueryError} from 'drizzle-orm/effect-core/errors'
import type * as Project from '../../schema/project.js'
import * as Database from '../database/database.js'
import {PermissionTable} from './sql.js'
import {permissionErrors} from '@conciv/errors'
import * as PermissionSaved from '../../schema/permission-saved.js'
import * as Identifier from '@conciv/protocol/schema/identifier'

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

export interface Interface {
  readonly list: (input?: ListInput) => Effect.Effect<ReadonlyArray<Info>>
  readonly add: (input: AddInput) => Effect.Effect<void>
  readonly update: (input: UpdateInput) => Effect.Effect<Info, EvlogError>
  readonly remove: (id: Id) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@conciv/PermissionSaved')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const ids = yield* Identifier.Service

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
            id: Id.create(ids),
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
      if (!current) return yield* Effect.fail(permissionErrors.SAVED_NOT_FOUND({id: input.id}))
      const action = input.action ?? current.action
      const resource = input.resource ?? current.resource
      const updated = yield* db
        .update(PermissionTable)
        .set({action, resource})
        .where(eq(PermissionTable.id, input.id))
        .returning()
        .get()
        .pipe(
          Effect.catchIf(isUniqueViolation, () =>
            Effect.fail(permissionErrors.SAVED_CONFLICT({action, resource, internal: {id: input.id}})),
          ),
          Effect.catchTag('EffectDrizzleQueryError', (error) => Effect.die(error)),
        )
      if (!updated) return yield* Effect.fail(permissionErrors.SAVED_NOT_FOUND({id: input.id}))
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
