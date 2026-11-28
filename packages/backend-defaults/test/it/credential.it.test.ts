import {join} from 'node:path'
import {it} from '@effect/vitest'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {Deferred, Effect, Fiber, Layer, Redacted} from 'effect'
import {describe, expect} from 'vitest'
import {Bus, Credential, EffectFlock, FSUtil, Global} from '@conciv/backend-app-api'
import * as Identifier from '@conciv/protocol/schema/identifier'
import * as IntegrationSchema from '@conciv/protocol/schema/integration'
import {credentialLayer, openHomeDatabase} from '../../src/core/database/home.js'
import {DatabaseLayer} from '../../src/backend-defaults.js'

describe('an expiring sign-in refreshes while other callers wait', () => {
  const integrationId = IntegrationSchema.Id.make('figma')

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
      const roots = {cache: join(root, 'cache'), config: root, state: join(root, 'state'), log: join(root, 'log')}
      const home = yield* openHomeDatabase(join(root, 'home'))
      return credentialLayer({ok: true, ...home}).pipe(
        Layer.provide(EffectFlock.layer),
        Layer.provide(Global.layerWith(roots)),
        Layer.provide(FSUtil.layer),
        Layer.provide(NodeFileSystem.layer),
        Layer.provideMerge(Bus.configured()),
        Layer.provide(DatabaseLayer.layer()),
        Layer.provide(NodeFileSystem.layer),
        Layer.provide(Layer.succeed(Identifier.Service, Identifier.makeMaker())),
      )
    }),
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
