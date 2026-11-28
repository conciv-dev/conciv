import {asc, desc, eq, type SQL} from 'drizzle-orm'
import {Cause, Clock, Context, Duration, Effect, Fiber, Layer, Option, Redacted, Schema} from 'effect'
import * as Credential from '@conciv/protocol/schema/credential'
import * as Identifier from '@conciv/protocol/schema/identifier'
import type * as Integration from '@conciv/protocol/schema/integration'
import * as Database from './database/database.js'
import * as Bus from './bus.js'
import {EffectFlock} from '../util/effect-flock.js'
import * as ErrorSummary from '../util/error-summary.js'
import {CredentialTable} from './credential/sql.js'

export const Id = Credential.Id
export type Id = Credential.Id

export const OAuth = Credential.OAuth
export type OAuth = Credential.OAuth

export const Key = Credential.Key
export type Key = Credential.Key

export const External = Credential.External
export type External = Credential.External

export const Value = Credential.Value
export type Value = Credential.Value

export const Event = Credential.Event

const Plain = Schema.RedactedFromValue(Schema.String)

export const StoredValue = Schema.Union([
  Schema.Struct({...Credential.OAuth.fields, refresh: Plain, access: Plain}),
  Schema.Struct({...Credential.Key.fields, key: Plain}),
  Credential.External,
])
export type StoredValue = typeof StoredValue.Encoded

const encodeStored = Schema.encodeSync(StoredValue)
const decodeStored = Schema.decodeUnknownOption(StoredValue)

export const expiring = (value: OAuth, now: number, margin: Duration.Input = Duration.minutes(5)) =>
  value.expires !== 0 && value.expires <= now + Duration.toMillis(margin)

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: Id,
  integrationId: Credential.Entry.fields.integrationId,
  label: Schema.String,
  value: Value,
}).annotate({identifier: 'Credential.Info'})

export interface Interface {
  readonly all: () => Effect.Effect<Info[]>
  readonly list: (integrationId: Integration.Id) => Effect.Effect<Info[]>
  readonly get: (id: Id) => Effect.Effect<Info | undefined>
  readonly refresh: (
    id: Id,
    input: {
      readonly stale: (current: OAuth, now: number) => boolean
      readonly refresh: (current: OAuth) => Effect.Effect<OAuth, unknown>
    },
  ) => Effect.Effect<OAuth | undefined, unknown>
  readonly create: (input: {
    readonly id?: Id
    readonly integrationId: Integration.Id
    readonly value: Value
    readonly label?: string
    readonly activate?: boolean
  }) => Effect.Effect<Info>
  readonly activate: (id: Id) => Effect.Effect<void>
  readonly update: (id: Id, updates: Partial<Pick<Info, 'label' | 'value'>>) => Effect.Effect<void>
  readonly remove: (id: Id) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@conciv/Credential')

type Row = typeof CredentialTable.$inferSelect

const sameSecret = (a: Redacted.Redacted<string>, b: Redacted.Redacted<string>) =>
  Redacted.value(a) === Redacted.value(b)

const redactQuery = (message: string | undefined) => message?.replace(/params:[\s\S]*$/, 'params: [redacted]')

const summary = (cause: Cause.Cause<unknown>) =>
  ErrorSummary.from(Cause.squash(cause)).map((error) => ({...error, message: redactQuery(error.message)}))

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const bus = yield* Bus.Service
    const flock = yield* EffectFlock.Service
    const ids = yield* Identifier.Service
    const scope = yield* Effect.scope
    const pending = new Map<Id, Fiber.Fiber<OAuth | undefined, unknown>>()
    const decode = (row: Row) =>
      Option.getOrThrowWith(
        decodeStored(row.value),
        () => new Error(`Stored credential value does not decode: ${row.id}`),
      )
    const stored = (row: Row): Info | undefined => {
      if (!row.integration_id) return
      return {
        id: row.id,
        integrationId: row.integration_id,
        label: row.label,
        value: decode(row),
      }
    }
    const storedRows = (rows: ReadonlyArray<Row>) =>
      rows.flatMap((row) => {
        const credential = stored(row)
        return credential ? [credential] : []
      })
    const logFailure =
      (message: string, fields: Record<string, unknown>) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.catchCause((cause) => {
            const errors = summary(cause)
            return Effect.logError(message, {...fields, errors}).pipe(
              Effect.andThen(Effect.die(new Error(`${message}: ${errors.map((error) => error.type).join(', ')}`))),
            )
          }),
        )
    const rows = (where?: SQL) =>
      db
        .select()
        .from(CredentialTable)
        .where(where)
        .orderBy(asc(CredentialTable.active), asc(CredentialTable.time_created), asc(CredentialTable.id))
        .all()
        .pipe(logFailure('credential list failed', {}), Effect.map(storedRows))
    type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
    const currentActive = (tx: Transaction, integrationId: Integration.Id) =>
      tx
        .select({id: CredentialTable.id, active: CredentialTable.active})
        .from(CredentialTable)
        .where(eq(CredentialTable.integration_id, integrationId))
        .orderBy(desc(CredentialTable.active), desc(CredentialTable.time_created), desc(CredentialTable.id))
        .get()
    const deactivateAll = (tx: Transaction, integrationId: Integration.Id) =>
      tx.update(CredentialTable).set({active: false}).where(eq(CredentialTable.integration_id, integrationId)).run()
    const switchActive = (tx: Transaction, integrationId: Integration.Id, id: Id) =>
      Effect.gen(function* () {
        yield* deactivateAll(tx, integrationId)
        yield* tx.update(CredentialTable).set({active: true}).where(eq(CredentialTable.id, id)).run()
      })

    const lock = (id: Id, operation: Effect.Effect<OAuth | undefined, unknown>) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const current = pending.get(id)
          if (current) return yield* restore(Fiber.join(current))
          const fiber = yield* operation.pipe(
            flock.withLock(`credential-refresh:${id}`),
            Effect.ensuring(Effect.sync(() => pending.delete(id))),
            Effect.forkIn(scope),
          )
          pending.set(id, fiber)
          return yield* restore(Fiber.join(fiber))
        }),
      )

    const get = Effect.fn('Credential.get')(function* (id: Id) {
      const row = yield* db
        .select()
        .from(CredentialTable)
        .where(eq(CredentialTable.id, id))
        .get()
        .pipe(logFailure('credential get failed', {credentialId: id}))
      return row ? stored(row) : undefined
    })

    const update = Effect.fn('Credential.update')(function* (id: Id, updates: Partial<Pick<Info, 'label' | 'value'>>) {
      if (updates.label === undefined && updates.value === undefined) return
      const credential = yield* db
        .select({integrationId: CredentialTable.integration_id, label: CredentialTable.label})
        .from(CredentialTable)
        .where(eq(CredentialTable.id, id))
        .get()
        .pipe(logFailure('credential update lookup failed', {credentialId: id}))
      if (!credential?.integrationId) {
        yield* Effect.logWarning('credential update skipped', {credentialId: id, reason: 'credential_missing'})
        return
      }
      if (updates.label === credential.label && updates.value === undefined) return
      const updated = yield* db
        .update(CredentialTable)
        .set({label: updates.label, value: updates.value === undefined ? undefined : encodeStored(updates.value)})
        .where(eq(CredentialTable.id, id))
        .returning({id: CredentialTable.id})
        .get()
        .pipe(logFailure('credential update failed', {credentialId: id, integrationId: credential.integrationId}))
      if (!updated) {
        yield* Effect.logWarning('credential update skipped', {credentialId: id, reason: 'credential_removed'})
        return
      }
      yield* Effect.logInfo('credential updated', {
        credentialId: id,
        integrationId: credential.integrationId,
        valueChanged: updates.value !== undefined,
        labelChanged: updates.label !== undefined && updates.label !== credential.label,
      })
      if (updates.label !== undefined && updates.label !== credential.label)
        yield* bus.publish(Event.Updated, {integrationId: credential.integrationId, credentialId: id}, {global: true})
    })

    const service: Interface = Service.of({
      refresh: Effect.fn('Credential.refresh')((id, input) =>
        lock(
          id,
          Effect.gen(function* () {
            const current = yield* get(id)
            if (current?.value.type !== 'oauth') return undefined
            if (!input.stale(current.value, yield* Clock.currentTimeMillis)) {
              yield* Effect.logInfo('credential refresh skipped', {credentialId: id, reason: 'already_refreshed'})
              return current.value
            }
            const value = yield* input.refresh(current.value).pipe(Effect.timeout('30 seconds'))
            const latest = yield* get(id)
            if (latest?.value.type !== 'oauth') return undefined
            if (
              !sameSecret(latest.value.access, current.value.access) ||
              !sameSecret(latest.value.refresh, current.value.refresh)
            ) {
              yield* Effect.logWarning('credential refresh discarded', {
                credentialId: id,
                reason: 'changed_meanwhile',
              })
              return latest.value
            }
            yield* update(id, {value})
            return value
          }),
        ),
      ),
      all: () => rows(),
      list: Effect.fn('Credential.list')((integrationId) => rows(eq(CredentialTable.integration_id, integrationId))),
      get,
      create: Effect.fn('Credential.create')(function* (input) {
        const credential: Info = {
          id: input.id ?? Id.create(ids),
          integrationId: input.integrationId,
          label: input.label ?? 'default',
          value: input.value,
        }
        const activated = yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const current = yield* currentActive(tx, credential.integrationId)
              const activate = input.activate !== false || !current
              if (activate) yield* deactivateAll(tx, credential.integrationId)
              if (!activate && current && !current.active)
                yield* tx.update(CredentialTable).set({active: true}).where(eq(CredentialTable.id, current.id)).run()
              yield* tx
                .insert(CredentialTable)
                .values({
                  id: credential.id,
                  integration_id: credential.integrationId,
                  label: credential.label,
                  value: encodeStored(credential.value),
                  active: activate,
                })
                .run()
              return activate
            }),
          )
          .pipe(
            logFailure('credential create failed', {
              credentialId: credential.id,
              integrationId: credential.integrationId,
            }),
          )
        yield* Effect.logInfo('credential created', {
          credentialId: credential.id,
          integrationId: credential.integrationId,
          type: credential.value.type,
          active: activated,
        })
        yield* bus.publish(
          Event.Updated,
          {integrationId: credential.integrationId, credentialId: credential.id},
          {global: true},
        )
        if (activated)
          yield* bus.publish(
            Event.Switched,
            {integrationId: credential.integrationId, credentialId: credential.id},
            {global: true},
          )
        return credential
      }),
      activate: Effect.fn('Credential.activate')(function* (id) {
        const integrationId = yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const credential = yield* tx.select().from(CredentialTable).where(eq(CredentialTable.id, id)).get()
              if (!credential?.integration_id) return
              const active = yield* currentActive(tx, credential.integration_id)
              if (active?.id === id) return
              yield* switchActive(tx, credential.integration_id, id)
              return credential.integration_id
            }),
          )
          .pipe(logFailure('credential activate failed', {credentialId: id}))
        if (integrationId) {
          yield* Effect.logInfo('credential activated', {integrationId, credentialId: id})
          yield* bus.publish(Event.Switched, {integrationId, credentialId: id}, {global: true})
        }
      }),
      update,
      remove: Effect.fn('Credential.remove')(function* (id) {
        const removed = yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const credential = yield* tx.select().from(CredentialTable).where(eq(CredentialTable.id, id)).get()
              if (!credential) return
              const active = credential.integration_id ? yield* currentActive(tx, credential.integration_id) : undefined
              yield* tx.delete(CredentialTable).where(eq(CredentialTable.id, id)).run()
              if (!credential.integration_id || active?.id !== id)
                return {switched: false as const, integrationId: credential.integration_id}
              const replacement = yield* tx
                .select({id: CredentialTable.id})
                .from(CredentialTable)
                .where(eq(CredentialTable.integration_id, credential.integration_id))
                .orderBy(desc(CredentialTable.time_created), desc(CredentialTable.id))
                .get()
              if (replacement) yield* switchActive(tx, credential.integration_id, replacement.id)
              return {
                switched: true as const,
                integrationId: credential.integration_id,
                credentialId: replacement?.id ?? null,
              }
            }),
          )
          .pipe(logFailure('credential remove failed', {credentialId: id}))
        if (!removed) return
        yield* Effect.logInfo('credential removed', {
          credentialId: id,
          integrationId: removed.integrationId,
          active: removed.switched,
          ...(removed.switched ? {replacementId: removed.credentialId} : {}),
        })
        if (removed.integrationId)
          yield* bus.publish(Event.Updated, {integrationId: removed.integrationId, credentialId: id}, {global: true})
        if (removed.switched)
          yield* bus.publish(
            Event.Switched,
            {integrationId: removed.integrationId, credentialId: removed.credentialId},
            {global: true},
          )
      }),
    })
    return service
  }),
)
