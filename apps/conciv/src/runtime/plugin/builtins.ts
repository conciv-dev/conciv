import {compose, type Entry} from '@conciv/plugin/experimental/host'
import {builtins as packageBuiltins} from '@conciv/builtin-plugins/renderer'
import type {Plugin} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {useHostApis} from './host-apis-context'

const provideGrab: Plugin.Setup = (ctx) => {
  ctx.provide(GrabApi, useHostApis().grab)
}

const hostBuiltins = compose({grab: {windowEntry: () => Promise.resolve({default: provideGrab})}})

export const builtins = [...packageBuiltins, ...hostBuiltins]

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

if (import.meta.hot)
  import.meta.hot.accept('@conciv/builtin-plugins/renderer', (module) => {
    const next: readonly Entry[] | undefined = module?.builtins

    if (next) window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, {detail: [...next, ...hostBuiltins]}))
  })
