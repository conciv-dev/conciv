import {defineConfig, type Plugin} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

function markdownText(): Plugin {
  return {
    name: 'conciv:markdown-text',
    transform(code, id) {
      if (id.endsWith('.md')) return `export default ${JSON.stringify(code)}`
    },
  }
}

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [markdownText(), concivTest()],
    environments: {
      server: {
        entries: [
          'src/backend-defaults.ts',
          'src/backend.ts',
          'src/ai.ts',
          'src/tools.ts',
          'src/engine/sessions/search-index-worker.ts',
          'src/ai/quickjs-worker.ts',
          'src/core/image/photon-worker.ts',
          'src/core/filesystem/fff.node.ts',
          'src/core/filesystem/fff.workerd.ts',
        ],
        external: ['#fff'],
      },
    },
  }),
)
