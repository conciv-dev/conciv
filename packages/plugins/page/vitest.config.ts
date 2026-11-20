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
    filesystem: ['src/**/*.{ts,tsx}', '../../ui-kit-system/src/**/*.{ts,tsx}', '../../ui-kit-chat/src/**/*.{ts,tsx}'],
  },
}

const browserTest = {
  ...ciTestSolidBrowser(),
  include: ['test/page.browser.test.tsx'],
  fileParallelism: false,
}

const browserDeps = [
  '@zumer/snapdom',
  '@solid-primitives/map',
  '@tanstack/hotkeys',
  '@tanstack/solid-pacer',
  'ai-motion',
  'effect',
]

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {...ciTest(), name: 'node', environment: 'node', include: ['test/page.test.ts']},
      },
      {
        plugins: [solidPlugin(), UnoCSS(widgetStyles)],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {include: browserDeps},
        test: {
          ...browserTest,
          name: 'browser',
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
      {
        plugins: [solidPlugin(), UnoCSS(widgetStyles)],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {include: browserDeps},
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
