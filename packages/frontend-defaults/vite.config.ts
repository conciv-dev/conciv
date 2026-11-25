import {defineConfig, searchForWorkspaceRoot} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [
    tanstackRouter({target: 'solid', autoCodeSplitting: false}),
    UnoCSS(),
    solidPlugin(),
    concivTest({environment: 'happy-dom'}),
    concivKitTest(),
  ],
  server: {fs: {allow: [searchForWorkspaceRoot(process.cwd()), '/__uno.css', '/__uno.css?inline']}},
})
