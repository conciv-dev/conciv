import {defineConfig, searchForWorkspaceRoot} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'
import {concivEngines} from './test/browser-engines'

export default defineConfig({
  plugins: [
    tanstackRouter({target: 'solid', autoCodeSplitting: false}),
    UnoCSS(),
    solidPlugin(),
    concivTest(),
    concivEngines(),
  ],
  server: {fs: {allow: [searchForWorkspaceRoot(process.cwd()), '/__uno.css', '/__uno.css?inline']}},
})
