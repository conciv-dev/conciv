import {builtins} from '@internal/builtin-plugins/renderer'
import type {Entry} from '@conciv/plugin/experimental/host'

export {builtins}

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

if (import.meta.hot)
  import.meta.hot.accept('@internal/builtin-plugins/renderer', (module) => {
    const next: readonly Entry[] | undefined = module?.builtins

    if (next) window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, {detail: next}))
  })
