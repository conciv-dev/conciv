import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import page from '@conciv/plugin-page/renderer'
import terminal from '@internal/plugin-terminal/client'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {GrabPicker} from '@conciv/frontend-plugin-api/grab'
import {BUILTINS_UPDATED} from '@internal/frontend-app-api/plugin/hmr'
import {useHostApis} from './host-apis-context'

const provideGrab: Plugin.Setup = (ctx) => {
  const provider = useHostApis().grabProvider
  if (provider) ctx.add(GrabPicker, provider())
}

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins = compose({
  grab: {windowEntry: () => Promise.resolve({default: provideGrab})},
  terminal: staticEntry(terminal),
  'conciv.page': staticEntry(page),
})

export const BUILTINS_WITH_ENGINE_HALF: ReadonlySet<string> = new Set(['conciv.page'])

if (import.meta.hot)
  import.meta.hot.accept('@internal/plugin-terminal/client', (module) => {
    if (module)
      window.dispatchEvent(
        new CustomEvent(BUILTINS_UPDATED, {detail: compose({terminal: staticEntry(module.default)})}),
      )
  })
