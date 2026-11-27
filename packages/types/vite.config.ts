import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {
      server: {
        entries: [
          'src/json.ts',
          'src/chat-types.ts',
          'src/chat-busy.ts',
          'src/chat-message-types.ts',
          'src/chat-event-types.ts',
          'src/chat-tool-types.ts',
          'src/usage-types.ts',
          'src/ui-types.ts',
          'src/harness-types.ts',
          'src/rpc-types.ts',
          'src/terminal-types.ts',
          'src/bundler-types.ts',
          'src/config-types.ts',
          'src/tool-view-types.ts',
          'src/connect-ports.ts',
          'src/state-types.ts',
          'src/migration-lock.ts',
          'src/engine-trust.ts',
          'src/event-bus.ts',
          'src/tool-call-types.ts',
          'src/secret-key.ts',
        ],
      },
    },
  }),
)
