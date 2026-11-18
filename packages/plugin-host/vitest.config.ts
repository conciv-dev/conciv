import {fileURLToPath} from 'node:url'
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
  resolve: {alias: {'#fff': fileURLToPath(new URL('src/core/filesystem/fff.node.ts', import.meta.url))}},
  test: {
    ...ciTest(),
    environment: 'node',
  },
})
