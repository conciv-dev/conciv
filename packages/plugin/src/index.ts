import {createUnplugin} from 'unplugin'
import type {AidxConfig} from '@aidx/protocol/config-types'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'

// The aidx unplugin factory. vite = the rich hook (live viteBridge + widget middleware + boot).
// webpack/rspack boot the engine bridge-less (present, not IT-verified; HTML injection is the
// host's job via widgetUrl). rollup/esbuild: build-only no-ops.
export const unplugin = createUnplugin<AidxConfig | undefined>((options = {}) => {
  const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
  const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd()))()

  return {
    name: 'aidx',
    vite: makeViteHook(options),
    webpack() {
      if (options.enabled !== false) void boot()
    },
    rspack() {
      if (options.enabled !== false) void boot()
    },
    rollup: {},
    esbuild: {},
  }
})

export default unplugin
