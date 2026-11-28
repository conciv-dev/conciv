import {join} from 'node:path'
import {it} from '@effect/vitest'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {Deferred, Effect, Fiber, Layer, Redacted} from 'effect'
import {describe, expect} from 'vitest'
import {Bus, Credential, EffectFlock, FSUtil, Global} from '@conciv/backend-app-api'
import * as Identifier from '@conciv/protocol/schema/identifier'
import * as IntegrationSchema from '@conciv/protocol/schema/integration'
import {openDb} from '../../src/db/connection.js'
import {DatabaseLayer} from '../../src/backend-defaults.js'

describe('a user keeps several credentials for one integration', () => {
  const integrationId = IntegrationSchema.Id.make('figma')

  const key = (value: string) => Credential.Key.make({type: 'key', key: Redacted.make(value)})

  const oauth = (access: string, refresh: string, expires: number) =>
    Credential.OAuth.make({
      type: 'oauth',
      methodId: IntegrationSchema.MethodId.make('oauth'),
      access: Redacted.make(access),
      refresh: Redacted.make(refresh),
      expires,
    })

  const reveal = (value: Credential.Value | undefined) => {
    if (value?.type === 'key') return {key: Redacted.value(value.key)}
    if (value?.type === 'oauth')
      return {access: Redacted.value(value.access), refresh: Redacted.value(value.refresh), expires: value.expires}
    return value
  }

  const store = Layer.unwrap(
    Effect.gen(function* () {
      const root = tempDir('conciv-credential-')
      const db = yield* openDb(root)
      const roots = {cache: join(root, 'cache'), config: root, state: join(root, 'state'), log: join(root, 'log')}
      return Credential.layer.pipe(
        Layer.provide(EffectFlock.layer),
        Layer.provide(Global.layerWith(roots)),
        Layer.provide(FSUtil.layer),
        Layer.provide(NodeFileSystem.layer),
        Layer.provideMerge(Bus.configured()),
        Layer.provideMerge(DatabaseLayer.configuredClient(db)),
        Layer.provide(Layer.succeed(Identifier.Service, Identifier.makeMaker())),
      )
    }),
  )

  const activeId = Effect.fn(function* () {
    const credentials = yield* Credential.Service
    return (yield* credentials.list(integrationId)).at(-1)?.id
  })

  it.live('the first credential is active, one added inactive leaves it so, and removing it activates the newest', () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const work = yield* credentials.create({integrationId, label: 'Work', value: key('work-key')})
      expect(yield* activeId()).toBe(work.id)

      const personal = yield* credentials.create({
        integrationId,
        label: 'Personal',
        value: key('personal-key'),
        activate: false,
      })
      expect(yield* activeId()).toBe(work.id)

      const spare = yield* credentials.create({integrationId, label: 'Spare', value: key('spare-key'), activate: false})
      yield* credentials.remove(work.id)
      expect(yield* activeId()).toBe(spare.id)
      expect((yield* credentials.list(integrationId)).map((credential) => credential.id)).toEqual([
        personal.id,
        spare.id,
      ])
      expect(reveal((yield* credentials.get(spare.id))?.value)).toEqual({key: 'spare-key'})
    }).pipe(Effect.provide(store)),
  )

  it.live('concurrent refreshes share one run, and a row changed while a refresh ran is kept', () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const {id} = yield* credentials.create({integrationId, value: oauth('old-access', 'old-refresh', 1)})
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const runs = {count: 0}
      const refreshed = oauth('new-access', 'new-refresh', Number.MAX_SAFE_INTEGER)
      const slow = {
        stale: () => true,
        refresh: () =>
          Effect.gen(function* () {
            runs.count += 1
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
            return refreshed
          }),
      }
      const first = yield* credentials.refresh(id, slow).pipe(Effect.forkScoped)
      yield* Deferred.await(entered)
      const second = yield* credentials.refresh(id, slow).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Deferred.succeed(release, undefined)
      expect(reveal(yield* Fiber.join(first))).toEqual(reveal(refreshed))
      expect(reveal(yield* Fiber.join(second))).toEqual(reveal(refreshed))
      expect(runs.count).toBe(1)

      const replaced = oauth('other-access', 'other-refresh', 3)
      const kept = yield* credentials.refresh(id, {
        stale: () => true,
        refresh: () => credentials.update(id, {value: replaced}).pipe(Effect.as(oauth('late-access', 'late', 2))),
      })
      expect(reveal(kept)).toEqual(reveal(replaced))
      expect(reveal((yield* credentials.get(id))?.value)).toEqual(reveal(replaced))
    }).pipe(Effect.scoped, Effect.provide(store)),
  )
})
