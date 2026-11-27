import {log} from 'evlog'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {Entry} from '@conciv/frontend-plugin-api/host'
import {usePluginHost} from './host'

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

export default function PluginHotReload() {
  const host = usePluginHost()
  makeEventListener(window, BUILTINS_UPDATED, (event) => {
    if (!(event instanceof CustomEvent)) return
    const next: readonly Entry[] = event.detail
    next.forEach((definition) => {
      const current = host.definitions().find((item) => item.id === definition.id)

      if (!current || host.status(definition.id) === 'disabled') return
      void changed(current, definition)
        .then((value) => {
          if (value) host.reload(definition.id, definition)
        })
        .catch((cause: unknown) =>
          log.error({action: 'plugin', message: 'the hot reload check failed', plugin: definition.id, error: cause}),
        )
    })
  })

  return null
}

async function changed(current: Entry, next: Entry) {
  if (!current.windowEntry || !next.windowEntry) return current.windowEntry !== next.windowEntry
  const [before, after] = await Promise.all([
    current.windowEntry().catch((error: unknown) => {
      log.debug({
        action: 'plugin',
        message: 'the replaced plugin window entry did not load; it counts as changed',
        error,
      })
      return undefined
    }),
    next.windowEntry(),
  ])

  return before?.default !== after.default
}
