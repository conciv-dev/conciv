import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/backend-defaults.ts',
    'src/backend.ts',
    'src/ai.ts',
    'src/tools.ts',
    'src/engine/sessions/search-index-worker.ts',
    'src/ai/quickjs-worker.ts',
    'src/core/image/photon-worker.ts',
    'src/core/filesystem/fff.node.ts',
    'src/core/filesystem/fff.workerd.ts',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
  loader: {'.md': 'text'},
  deps: {neverBundle: ['#fff']},
})
