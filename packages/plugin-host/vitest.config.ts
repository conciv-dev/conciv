import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  plugins: [
    {
      name: 'markdown-text',
      transform: (code, id) =>
        id.endsWith('.md') ? {code: `export default ${JSON.stringify(code)}`, map: null} : undefined,
    },
  ],
  test: {
    ...ciTest(),
    environment: 'node',
  },
})
