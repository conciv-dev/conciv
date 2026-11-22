import {defineConfig, searchForWorkspaceRoot} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig(({mode}) => ({
  plugins: [
    tanstackRouter({target: 'solid', autoCodeSplitting: false}),
    ...(mode === 'test' ? [] : [UnoCSS()]),
    solidPlugin(),
    concivTest(),
  ],
  server: {fs: {allow: [searchForWorkspaceRoot(process.cwd()), '/__uno.css', '/__uno.css?inline']}},
}))
