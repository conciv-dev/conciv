import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {
    alwaysBundle: [
      /^@tanstack\/ai(\/|$)/,
      /^@tanstack\/ai-solid(\/|$)/,
      /^@tanstack\/solid-query(\/|$)/,
      /^@tanstack\/query-core(\/|$)/,
      /^@orpc\/tanstack-query(\/|$)/,
    ],
  },
})
