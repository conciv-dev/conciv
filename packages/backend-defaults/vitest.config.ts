import {defineConfig, type Plugin} from 'vitest/config'
import {concivTest} from '@internal/vitest-config/conciv-test'

function markdownText(): Plugin {
  return {
    name: 'conciv:markdown-text',
    transform(code, id) {
      if (id.endsWith('.md')) return `export default ${JSON.stringify(code)}`
    },
  }
}

export default defineConfig({plugins: [markdownText(), concivTest()]})
