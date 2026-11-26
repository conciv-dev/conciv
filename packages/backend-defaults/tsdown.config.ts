import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: {
    'backend-defaults': 'src/backend-defaults.ts',
    backend: 'src/backend.ts',
    'search-index-worker': 'src/engine/sessions/search-index-worker.ts',
    ai: 'src/ai.ts',
    tools: 'src/tools.ts',
    'quickjs-worker': 'src/ai/quickjs-worker.ts',
    'photon-worker': 'src/core/image/photon-worker.ts',
    'core/filesystem/fff.node': 'src/core/filesystem/fff.node.ts',
    'core/filesystem/fff.workerd': 'src/core/filesystem/fff.workerd.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
  loader: {'.md': 'text'},
  deps: {neverBundle: ['#fff']},
})
