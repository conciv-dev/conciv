import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        plugins: [solidPlugin()],
        test: {
          ...ciTestSolidBrowser(),
          name: 'brand-solid-browser',
          include: ['tests/browser/solid-lockup.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
      {
        extends: true,
        plugins: [solidPlugin()],
        test: {
          ...ciTestSolidBrowser(),
          name: 'brand-solid-browser-reduced-motion',
          include: ['tests/browser/solid-lockup-reduced-motion.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({contextOptions: {reducedMotion: 'reduce'}}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
      {
        extends: true,
        esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
        test: {
          ...ciTest(),
          name: 'brand-react-browser',
          include: ['tests/browser/react-lockup.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
      {
        extends: true,
        esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
        test: {
          ...ciTest(),
          name: 'brand-react-browser-reduced-motion',
          include: ['tests/browser/react-lockup-reduced-motion.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({contextOptions: {reducedMotion: 'reduce'}}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
