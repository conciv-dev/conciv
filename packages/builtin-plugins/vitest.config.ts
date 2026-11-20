import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS, {type VitePluginConfig} from 'unocss/vite'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'
import unoConfig from './uno.config.js'

const widgetStyles: VitePluginConfig = {
  ...unoConfig,
  configFile: false,
  content: {
    filesystem: ['src/**/*.{ts,tsx}', '../ui-kit-system/src/**/*.{ts,tsx}', '../ui-kit-chat/src/**/*.{ts,tsx}'],
  },
}

const browserTest = {
  ...ciTestSolidBrowser(),
  include: ['test/**/*.browser.test.tsx'],
  fileParallelism: false,
}

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        plugins: [solidPlugin(), UnoCSS(widgetStyles)],
        resolve: {conditions: ['browser', 'development']},
        test: {
          ...browserTest,
          name: 'browser',
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
      {
        plugins: [solidPlugin(), UnoCSS(widgetStyles)],
        resolve: {conditions: ['browser', 'development']},
        test: {
          ...browserTest,
          name: 'browser-firefox',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({contextOptions: {deviceScaleFactor: 2}}),
            instances: [{browser: 'firefox'}],
          },
        },
      },
    ],
  },
})
