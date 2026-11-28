import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/conciv-lockup.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  banner: "'use client';",
})
