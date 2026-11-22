import {spawn, spawnSync, type ChildProcessByStdio} from 'node:child_process'
import type {Readable} from 'node:stream'
import {test as base} from 'vitest'
import {loadIsolateDriver} from '../src/server/code-mode.js'
import type {CodeDriver} from '../src/server/quickjs-thread.js'

type NodeProgram = ChildProcessByStdio<null, Readable, null>

export const test = base.extend<{
  driver: CodeDriver
  groups: number[]
  runNode: (program: string, cwd: string) => NodeProgram
}>({
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
  runNode: async ({task: _task}, use) => {
    const children: NodeProgram[] = []
    await use((program, cwd) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
        cwd,
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      children.push(child)
      return child
    })
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  },
})

export function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}
