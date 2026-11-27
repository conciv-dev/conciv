import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {
      server: {
        entries: ['src/client.ts'],
        noExternal: [
          /^@tanstack\/ai(\/|$)/,
          /^@tanstack\/ai-solid(\/|$)/,
          /^@tanstack\/solid-query(\/|$)/,
          /^@tanstack\/query-core(\/|$)/,
          /^@orpc\/tanstack-query(\/|$)/,
        ],
      },
      chat: {
        entries: {chat: 'src/chat.ts'},
        noExternal: [/^@tanstack\/ai-(client|solid)(\/|$)/],
        define: {'process.env.NODE_ENV': '"production"'},
      },
    },
  }),
)
