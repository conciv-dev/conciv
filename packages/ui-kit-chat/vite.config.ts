import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import manifest from './package.json' with {type: 'json'}

const external = Object.keys({...manifest.dependencies, ...manifest.peerDependencies}).map(
  (name) => new RegExp(`^${name}(/|$)(?!.*\\?)`),
)

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        'ui-kit-chat': 'src/ui-kit-chat.tsx',
        tools: 'src/tools.tsx',
        'draft-storage': 'src/draft-storage.ts',
        'theme/fonts': 'src/theme/fonts.ts',
        'theme/code-theme': 'src/theme/code-theme.ts',
      },
      formats: ['es'],
    },
    emptyOutDir: false,
    rolldownOptions: {external},
  },
})
