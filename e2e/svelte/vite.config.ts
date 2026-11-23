import adapter from '@sveltejs/adapter-auto'
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [
    conciv(),
    sveltekit({
      compilerOptions: {
        runes: ({filename}) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
      },

      adapter: adapter(),
    }),
  ],
})
