import {defineConfig} from 'tsdown'

const shared = {
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
} as const

export default defineConfig([
  {
    ...shared,
    entry: ['src/client.ts'],
    deps: {
      alwaysBundle: [
        /^@tanstack\/ai(\/|$)/,
        /^@tanstack\/ai-solid(\/|$)/,
        /^@tanstack\/solid-query(\/|$)/,
        /^@tanstack\/query-core(\/|$)/,
        /^@orpc\/tanstack-query(\/|$)/,
      ],
      dts: {alwaysBundle: []},
    },
  },
  {
    ...shared,
    entry: ['src/chat.ts'],
    clean: false,
    define: {'process.env.NODE_ENV': '"production"'},
    deps: {alwaysBundle: [/^@tanstack\/ai-(client|solid)(\/|$)/], dts: {alwaysBundle: []}},
  },
])
