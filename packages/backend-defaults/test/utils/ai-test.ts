import {test as base} from 'vitest'
import {loadIsolateDriver} from '../../src/ai/code-mode.js'
import type {CodeDriver} from '../../src/ai/quickjs-thread.js'

export const test = base.extend<{
  driver: CodeDriver
}>({
  driver: async ({task: _task}, use) => {
    const driver = loadIsolateDriver({runFork: () => undefined})
    if (driver === null) throw new Error('the QuickJS driver did not start')
    await use(driver)
    await driver.dispose()
  },
})
