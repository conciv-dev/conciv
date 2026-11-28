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
      entry: [
        'src/ui-kit-chat.tsx',
        'src/tools.tsx',
        'src/draft-storage.ts',
        'src/theme/fonts.ts',
        'src/theme/code-theme.ts',
      ],
      formats: ['es'],
    },
    emptyOutDir: false,
    rolldownOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: ({name}) => `${name.replace(/^.*node_modules\//, '_virtual/').replace(/_inline$/, '')}.js`,
      },
    },
  },
})
