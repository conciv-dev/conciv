import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid()],
    environments: {
      client: {
        entries: {'ui-kit-tap': 'src/ui-kit-tap.tsx'},
        external: [/^solid-js/, /^@ark-ui\//, /^@conciv\//, /^@tiptap\//, /^prosemirror-/, /^@floating-ui\//],
      },
    },
  }),
)
