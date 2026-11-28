import {define} from '@conciv/backend-plugin-api/effect/plugin'
import {Effect, Stream} from 'effect'
import * as Bus from '@conciv/backend-app-api/core/bus'
import * as WellKnown from '@conciv/backend-app-api/core/wellknown'

export const Plugin = define({
  id: 'conciv.wellknown',
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const wellknown = yield* WellKnown.Service
    yield* wellknown.entries().pipe(Effect.orDie)
    yield* ctx.integration.transform((editor) => {
      wellknown.snapshot().forEach((entry) => {
        if (!entry.manifest.auth) return
        editor.update(entry.integrationId, (integration) => {
          integration.name = new URL(entry.origin).hostname
        })
        editor.method.update({
          integrationId: entry.integrationId,
          method: {
            id: 'login',
            type: 'command',
            label: 'Log in',
            command: [...entry.manifest.auth.command],
          },
        })
      })
    })
    yield* bus.subscribe(WellKnown.Event.Updated).pipe(
      Stream.runForEach(() => ctx.integration.reload()),
      Effect.forkScoped({startImmediately: true}),
    )
  }),
})
