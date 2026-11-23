import {compose} from '@conciv/plugin/experimental/host'
import {builtins as builtinPlugins} from '@internal/builtin-plugins'
import type {Plugin} from '@conciv/plugin/experimental'
import {GrabPicker} from '@conciv/plugin/experimental/grab'
import {useHostApis} from './host-apis-context'

const provideGrab: Plugin.Setup = (ctx) => {
  const provider = useHostApis().grabProvider
  if (provider) ctx.add(GrabPicker, provider())
}

export const builtins = [
  ...compose({grab: {windowEntry: () => Promise.resolve({default: provideGrab})}}),
  ...builtinPlugins,
]

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

if (import.meta.hot)
  import.meta.hot.accept('@internal/builtin-plugins', (module) => {
    if (module) window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, {detail: module.builtins}))
  })
