import {spawn, spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import {pathToFileURL} from 'node:url'
import {test as base, describe, expect} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const sandboxModule = pathToFileURL(join(import.meta.dirname, 'local-sandbox.ts')).href

const test = base.extend<{groups: number[]}>({
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

function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}

describe.skipIf(process.platform === 'win32')('the local sandbox', () => {
  test('kills every agent process group still running when the engine process exits without stopping it', async ({
    groups,
  }) => {
    const program = [
      `import {localSandbox} from ${JSON.stringify(sandboxModule)}`,
      'const sandbox = await localSandbox({dir: process.cwd()}).create({})',
      "const agent = await sandbox.process.spawn('sleep 600')",
      'console.log(agent.pid)',
      'process.exit(0)',
    ].join('\n')
    const engine = spawn(process.execPath, ['--input-type=module', '-e', program], {
      cwd: tempDir('sandbox-exit-'),
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    const exited = once(engine, 'exit')
    const [line] = await once(createInterface({input: engine.stdout}), 'line')
    const agent = Number(line)
    groups.push(agent)

    await exited

    expect(agent).toBeGreaterThan(0)
    expect(running(agent)).toBe(false)
  })
})
