import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
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
