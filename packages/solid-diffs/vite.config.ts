import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import manifest from './package.json' with {type: 'json'}

const external = Object.keys({...manifest.dependencies, ...manifest.peerDependencies}).map(
  (name) => new RegExp(`^${name}(/|$)(?!.*\\?)`),
)

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {entry: ['src/solid-diffs.tsx'], formats: ['es']},
    emptyOutDir: false,
    rolldownOptions: {external},
  },
})
