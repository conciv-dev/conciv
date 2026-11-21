import {test as base} from 'vitest'
import {loadIsolateDriver} from '../src/server/code-mode.js'
import type {CodeDriver} from '../src/server/quickjs-thread.js'

export const test = base.extend<{driver: CodeDriver}>({
  driver: async ({task: _task}, use) => {
    const driver = loadIsolateDriver(() => undefined)
    if (driver === null) throw new Error('the QuickJS driver did not start')
    await use(driver)
    await driver.dispose()
  },
})
