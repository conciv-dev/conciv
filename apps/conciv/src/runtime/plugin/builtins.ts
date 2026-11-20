import {compose, type Entry} from '@conciv/plugin/experimental/host'
import {builtins as packageBuiltins} from '@conciv/builtin-plugins/renderer'
import terminal from '@conciv/plugin-terminal/client'
import type {Plugin} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {useHostApis} from './host-apis-context'

const provideGrab: Plugin.Setup = (ctx) => {
  ctx.provide(GrabApi, useHostApis().grab)
}

const hostBuiltins = compose({grab: {windowEntry: () => Promise.resolve({default: provideGrab})}})

function composeTerminal({setup, ...declarations}: typeof terminal): Entry[] {
  return compose({terminal: {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}})
}

export const builtins = [...packageBuiltins, ...composeTerminal(terminal), ...hostBuiltins]

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

function announceBuiltins(next: readonly Entry[]) {
  window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, {detail: next}))
}

if (import.meta.hot) {
  import.meta.hot.accept('@conciv/builtin-plugins/renderer', (module) => {
    const next: readonly Entry[] | undefined = module?.builtins

    if (next) announceBuiltins(next)
  })
  import.meta.hot.accept('@conciv/plugin-terminal/client', (module) => {
    if (module) announceBuiltins(composeTerminal(module.default))
  })
}
