import {createUnplugin, type UnpluginOptions} from 'unplugin'
import type {MandaraxConfig} from '@mandarax/protocol/config-types'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'

// The mandarax unplugin factory. vite = the rich hook (live viteBridge + widget middleware + boot).
// webpack/rspack boot the engine bridge-less (present, not IT-verified; HTML injection is the
// host's job via widgetUrl). rollup/esbuild: build-only no-ops.
export const unplugin = createUnplugin<MandaraxConfig | undefined>((options = {}) => {
  const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
  const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd()))()

  return {
    name: 'mandarax',
    // unplugin resolves its own `vite` (the yaml-peer variant); this package's devDep vite
    // resolves without that peer, so TS treats the two structurally-identical `Plugin` types
    // as unrelated. Cast at the boundary to unplugin's expected vite type.
    vite: makeViteHook(options) as UnpluginOptions['vite'],
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
