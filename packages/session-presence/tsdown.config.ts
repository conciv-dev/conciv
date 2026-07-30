import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/presence.ts', 'src/transcript-watch.ts', 'src/transcript-mirror.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
