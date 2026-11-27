import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: [
          'src/schema/workspace-id.ts',
          'src/schema/session-id.ts',
          'src/schema/session-event.ts',
          'src/schema/browser-tab.ts',
          'src/schema/browser-tab-event.ts',
          'src/schema/job.ts',
          'src/schema/project-id.ts',
          'src/schema/instruction.ts',
          'src/schema/identifier.ts',
          'src/schema/schema.ts',
          'src/schema/instruction-entry.ts',
          'src/schema/session-message.ts',
          'src/schema/session-inbox.ts',
          'src/options.ts',
          'src/schema/plugin.ts',
          'src/schema/tool.ts',
          'src/schema/session.ts',
          'src/schema/skill.ts',
          'src/schema/provider.ts',
          'src/schema/event-manifest.ts',
          'src/schema/event.ts',
          'src/schema/agent.ts',
          'src/schema/permission.ts',
          'src/schema/model.ts',
          'src/schema/location.ts',
          'src/schema/bundler.ts',
          'src/schema/rpc.ts',
          'src/execute-schemas.ts',
          'src/protocol.ts',
          'src/simulation.ts',
        ],
        unbundle: true,
      },
    },
  }),
)
