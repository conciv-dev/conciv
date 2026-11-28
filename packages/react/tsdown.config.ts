import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/react.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  banner: "'use client';",
})
