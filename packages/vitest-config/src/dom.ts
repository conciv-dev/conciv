import {join} from 'node:path'
import {ciTestSolidBrowser} from './reporters.ts'

const TESTING_LIBRARY_SETUP = join(import.meta.dirname, 'setup/testing-library-setup.ts')

export function ciTestDom(): ReturnType<typeof ciTestSolidBrowser> & {
  environment: 'happy-dom'
  include: string[]
  css: {include: RegExp[]}
} {
  const solid = ciTestSolidBrowser()
  return {
    ...solid,
    environment: 'happy-dom',
    setupFiles: [...solid.setupFiles, '@testing-library/jest-dom/vitest', TESTING_LIBRARY_SETUP],
    include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
    css: {include: [/.+/]},
  }
}
