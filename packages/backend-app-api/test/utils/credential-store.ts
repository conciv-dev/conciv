import {join} from 'node:path'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {sql} from 'drizzle-orm'
import {makeWithDefaults} from 'drizzle-orm/effect-sqlite-node'
import {Effect, Layer, Redacted, type Scope} from 'effect'
import {Bus, Credential, Database, EffectFlock, FSUtil, Global, Identifier} from '../../src/backend-app-api.js'
import * as IntegrationSchema from '@conciv/protocol/schema/integration'

export const integrationId = IntegrationSchema.Id.make('figma')

export const key = (secret: string) => Credential.Key.make({type: 'key', key: Redacted.make(secret)})

export const oauth = (access: string, refresh: string, expires: number) =>
  Credential.OAuth.make({
    type: 'oauth',
    methodId: IntegrationSchema.MethodId.make('oauth'),
    access: Redacted.make(access),
    refresh: Redacted.make(refresh),
    expires,
  })

export const reveal = (value: Credential.Value | undefined) => {
  if (value?.type === 'key') return {key: Redacted.value(value.key)}
  if (value?.type === 'oauth')
    return {access: Redacted.value(value.access), refresh: Redacted.value(value.refresh), expires: value.expires}
  return value
}

const memoryDatabase = Layer.effect(
  Database.Service,
  Effect.gen(function* () {
    const db = yield* makeWithDefaults()
    yield* db.run(
      sql.raw(
        'CREATE TABLE `credential` (`id` text PRIMARY KEY, `integration_id` text, `label` text NOT NULL, `value` text NOT NULL, `connector_id` text, `method_id` text, `active` integer, `time_created` integer NOT NULL, `time_updated` integer NOT NULL)',
      ),
    )
    return {db}
  }).pipe(Effect.orDie),
).pipe(Layer.provide(Layer.orDie(SqliteClient.layer({filename: ':memory:'}))))

const store = Layer.unwrap(
  Effect.sync(() => {
    const root = tempDir('conciv-credential-')
    const roots = {cache: join(root, 'cache'), config: root, state: join(root, 'state'), log: join(root, 'log')}
    return Credential.layer.pipe(
      Layer.provide(EffectFlock.layer),
      Layer.provide(Global.layerWith(roots)),
      Layer.provide(FSUtil.layer),
      Layer.provide(Bus.configured()),
      Layer.provide(memoryDatabase),
      Layer.provide(NodeFileSystem.layer),
      Layer.provide(Layer.succeed(Identifier.Service, Identifier.makeMaker())),
    )
  }),
)

export const run = <A, E>(effect: Effect.Effect<A, E, Credential.Interface | Scope.Scope>) =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(store)))

export const activeLabel = (credentials: Credential.Interface) =>
  credentials.list(integrationId).pipe(Effect.map((listed) => listed.at(-1)?.label))
