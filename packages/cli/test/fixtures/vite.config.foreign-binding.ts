import {defineConfig} from 'vite'
import conciv from 'some-other-plugin'
import {somethingElse} from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [conciv()],
  define: {marker: somethingElse},
})
