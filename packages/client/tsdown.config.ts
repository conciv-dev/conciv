import {defineConfig} from 'tsdown'

const tanstackAi = [/^@tanstack\/ai(\/|$)/, /^@tanstack\/ai-solid(\/|$)/]

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: {resolver: 'tsc'},
  deps: {
    alwaysBundle: [
      ...tanstackAi,
      /^@tanstack\/solid-query(\/|$)/,
      /^@tanstack\/query-core(\/|$)/,
      /^@orpc\/tanstack-query(\/|$)/,
    ],
    dts: {alwaysBundle: tanstackAi},
  },
})
