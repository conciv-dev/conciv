import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/ai-testkit.ts',
    'src/scripted-harness.ts',
    'src/test-llm.ts',
    'src/backend/backend.ts',
    'src/driver.ts',
    'src/frontend.ts',
    'src/manifest.ts',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
})
