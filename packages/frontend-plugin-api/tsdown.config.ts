import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/frontend-plugin-api.ts', 'src/vite.ts', 'src/host.ts', 'src/grab.ts', 'src/page.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  unbundle: true,
  fixedExtension: false,
})
