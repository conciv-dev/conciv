import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/harness-engine.ts', 'src/run-tests.ts', 'src/test-llm.ts', 'src/clock-steps.ts'],
  format: 'esm',
  platform: 'neutral',
  fixedExtension: false,
  dts: false,
})
