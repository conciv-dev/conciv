import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid()],
    environments: {
      client: {
        entries: [
          'src/ui-kit-chat.tsx',
          'src/tools.tsx',
          'src/draft-storage.ts',
          'src/theme/fonts.ts',
          'src/theme/code-theme.ts',
        ],
        external: [
          /^solid-js/,
          /^zod/,
          /^mermaid/,
          /^@tanstack\//,
          /^@conciv\//,
          /^@pierre\/diffs/,
          /^shiki/,
          /^@shikijs\//,
        ],
        bundle: true,
      },
    },
  }),
)
