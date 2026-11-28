import {Deferred, Effect, Fiber} from 'effect'
import {describe, expect, it} from 'vitest'
import {Credential} from '../../src/backend-app-api.js'
import {activeLabel, integrationId, key, oauth, reveal, run} from '../utils/credential-store.js'

describe('a user keeps several credentials for one integration', () => {
  it('a create activates, an inactive create keeps the active one, and a remove switches to the newest left', () =>
    run(
      Effect.gen(function* () {
        const credentials = yield* Credential.Service
        yield* credentials.create({integrationId, label: 'Work', value: key('work-key')})
        expect(yield* activeLabel(credentials)).toBe('Work')

        yield* credentials.create({integrationId, label: 'Spare', value: key('spare-key'), activate: false})
        expect(yield* activeLabel(credentials)).toBe('Work')

        const signIn = yield* credentials.create({integrationId, label: 'Sign-in', value: key('sign-in-key')})
        expect(yield* activeLabel(credentials)).toBe('Sign-in')

        yield* credentials.remove(signIn.id)
        expect((yield* credentials.list(integrationId)).map(({label}) => label)).toEqual(['Work', 'Spare'])
        expect(yield* activeLabel(credentials)).toBe('Spare')
      }),
    ))
})

describe('an expiring sign-in refreshes while other callers wait', () => {
  it('concurrent refreshes share one run, and a row changed while a refresh ran is kept', () =>
    run(
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
      }),
    ))
})
