import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {once} from 'node:events'
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

    let fixturePid: number | undefined
    try {
      const [chunk] = await once(parent.stdout, 'data')
      if (!(chunk instanceof Buffer)) throw new Error('expected a Buffer chunk from stdout')
      const match = /READY (\d+)/.exec(chunk.toString())
      if (!match) throw new Error('orphan-parent-sim did not report READY')
      const confirmedFixturePid = Number(match[1])
      fixturePid = confirmedFixturePid
      expect(isAlive(confirmedFixturePid)).toBe(true)

      process.kill(parentPid, 'SIGKILL')
      await vi.waitFor(() => expect(isAlive(parentPid)).toBe(false), {timeout: 2000, interval: 50})
      await vi.waitFor(() => expect(isAlive(confirmedFixturePid)).toBe(false), {timeout: 5000, interval: 50})
    } finally {
      if (isAlive(parentPid)) process.kill(parentPid, 'SIGKILL')
      if (fixturePid !== undefined && isAlive(fixturePid)) process.kill(fixturePid, 'SIGKILL')
    }
  }, 12_000)
})
