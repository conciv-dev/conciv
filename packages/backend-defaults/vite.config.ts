import {defineConfig} from 'vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [
    {
      name: 'conciv:markdown-text',
      transform(code, id) {
        if (id.endsWith('.md')) return `export default ${JSON.stringify(code)}`
      },
    },
    concivTest(),
  ],
})
