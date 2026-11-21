import {spawnSync} from 'node:child_process'
import {test as base} from 'vitest'
import {loadIsolateDriver} from '../src/server/code-mode.js'
import type {CodeDriver} from '../src/server/quickjs-thread.js'

export const test = base.extend<{driver: CodeDriver; groups: number[]}>({
  driver: async ({task: _task}, use) => {
    const driver = loadIsolateDriver(() => undefined)
    if (driver === null) throw new Error('the QuickJS driver did not start')
    await use(driver)
    await driver.dispose()
  },
  groups: async ({task: _task}, use) => {
    const groups: number[] = []
    await use(groups)
    for (const group of groups) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        continue
      }
    }
  },
})

export function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}
