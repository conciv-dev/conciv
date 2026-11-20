import type {} from 'vitest/config'
import {defineConfig, searchForWorkspaceRoot} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {playwright} from '@vitest/browser-playwright'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const BROWSER_TESTS = ['src/**/*.browser.test.ts']

export default defineConfig({
  plugins: [tanstackRouter({target: 'solid', autoCodeSplitting: false}), UnoCSS(), solidPlugin()],
  server: {fs: {allow: [searchForWorkspaceRoot(process.cwd()), '/__uno.css', '/__uno.css?inline']}},
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {name: 'unit', environment: 'node', include: ['src/**/*.test.ts'], exclude: BROWSER_TESTS},
      },
      {
        extends: true,
        test: {
          ...ciTestSolidBrowser(),
          name: 'browser',
          include: BROWSER_TESTS,
          browser: {enabled: true, headless: true, provider: playwright(), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
