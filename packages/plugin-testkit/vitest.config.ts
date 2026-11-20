import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {defineConfig} from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {ciTest} from '@conciv/vitest-config'
import {ciTestDom} from '@conciv/vitest-config/dom'

const APP_UNO_CONFIG = join(
  dirname(createRequire(import.meta.url).resolve('@conciv/app/package.json')),
  'uno.config.ts',
)

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
      {
        plugins: [UnoCSS({configFile: APP_UNO_CONFIG}), solidPlugin()],
        server: {fs: {strict: false}},
        test: {
          ...ciTestDom(),
          name: 'dom',
          environment: './src/dom-environment.ts',
          environmentOptions: {happyDOM: {width: 1280, height: 800}},
          server: {deps: {inline: [/solid/, /@ark-ui/, /@zag-js/]}},
        },
      },
    ],
  },
})
