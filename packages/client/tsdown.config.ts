import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    sourcemap: true,
    entry: ['src/client.ts', 'src/testing.ts'],
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
  },
  {
    sourcemap: true,
    entry: {chat: 'src/chat.ts'},
    format: 'esm',
    fixedExtension: false,
    dts: false,
    noExternal: [/^@tanstack\/ai-(client|solid)(\/|$)/],
    env: {NODE_ENV: 'production'},
  },
])
