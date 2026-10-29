import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/messages.ts', 'src/events.ts', 'src/tools.ts', 'src/usage.ts', 'src/testkit.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
