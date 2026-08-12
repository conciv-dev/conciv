import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {describe, expect, it, vi} from 'vitest'

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const parentSimPath = fileURLToPath(new URL('../fixtures/orphan-parent-sim.ts', import.meta.url))

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('fake-claude orphan self-reap (IT, real process kill)', () => {
  it('exits on its own once its spawning parent is SIGKILLed, without anyone signaling it directly', async () => {
    const parent = spawn(process.execPath, ['--import', tsxEntry, parentSimPath], {stdio: ['ignore', 'pipe', 'pipe']})
    const parentPid = parent.pid
    if (parentPid === undefined) throw new Error('orphan-parent-sim did not spawn')

    const ready = await new Promise<string>((resolve, reject) => {
      let buffer = ''
      parent.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const match = /READY (\d+)/.exec(buffer)
        if (match) resolve(match[1] ?? '')
      })
      parent.once('error', reject)
      setTimeout(() => reject(new Error('orphan-parent-sim never reported READY')), 5000)
    })
    const fixturePid = Number(ready)
    expect(isAlive(fixturePid)).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(isAlive(fixturePid)).toBe(true)

    process.kill(parentPid, 'SIGKILL')
    await vi.waitFor(() => expect(isAlive(parentPid)).toBe(false), {timeout: 2000, interval: 50})

    try {
      await vi.waitFor(() => expect(isAlive(fixturePid)).toBe(false), {timeout: 3000, interval: 50})
    } finally {
      if (isAlive(fixturePid)) process.kill(fixturePid, 'SIGKILL')
    }
  }, 10_000)
})
