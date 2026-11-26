import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/ai-testkit.ts', 'src/scripted-harness.ts', 'src/test-llm.ts', 'src/backend/backend.ts', 'src/driver.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: false,
})
