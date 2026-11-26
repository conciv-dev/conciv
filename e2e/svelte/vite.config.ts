import adapter from '@sveltejs/adapter-auto'
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)}),
    sveltekit({
      compilerOptions: {
        runes: ({filename}) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
      },

      adapter: adapter(),
    }),
  ],
})
