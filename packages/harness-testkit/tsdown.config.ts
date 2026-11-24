import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/index.ts', 'src/test-llm.ts', 'src/clock-steps.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: false,
})
