import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/whiteboard.ts', 'src/rpc.ts', 'src/plugin-experimental.tsx'],
  format: 'esm',
  fixedExtension: false,
  clean: false,
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
})
