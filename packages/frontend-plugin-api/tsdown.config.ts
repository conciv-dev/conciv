import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: {
    'frontend-plugin-api': 'src/frontend-plugin-api.ts',
    vite: 'src/vite.ts',
    host: 'src/host.ts',
    grab: 'src/grab.ts',
    page: 'src/page.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
