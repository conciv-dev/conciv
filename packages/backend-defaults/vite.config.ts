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
        entries: {
          'backend-defaults': 'src/backend-defaults.ts',
          backend: 'src/backend.ts',
          'search-index-worker': 'src/engine/sessions/search-index-worker.ts',
          ai: 'src/ai.ts',
          tools: 'src/tools.ts',
          'quickjs-worker': 'src/ai/quickjs-worker.ts',
          'photon-worker': 'src/core/image/photon-worker.ts',
          'core/filesystem/fff.node': 'src/core/filesystem/fff.node.ts',
          'core/filesystem/fff.workerd': 'src/core/filesystem/fff.workerd.ts',
        },
        external: ['#fff'],
      },
    },
  }),
)
