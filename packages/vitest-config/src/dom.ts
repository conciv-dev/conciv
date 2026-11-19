import {ciTestSolidBrowser} from './reporters.ts'

export function ciTestDom(): ReturnType<typeof ciTestSolidBrowser> & {
  environment: 'happy-dom'
  include: string[]
} {
  const solid = ciTestSolidBrowser()
  return {
    ...solid,
    environment: 'happy-dom',
    setupFiles: [...solid.setupFiles, '@testing-library/jest-dom/vitest'],
    include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
  }
}
