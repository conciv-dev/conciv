import {describe, expect, it, onTestFinished, vi} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {localSandbox} from './local-sandbox.js'

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

describe('local sandbox stop grace', () => {
  it('kills a child that ignores SIGTERM once the grace it was given is over, on a clock that never moves', async () => {
    vi.useFakeTimers({toFake: ['Date']})
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const provider = localSandbox({dir: tempDir('conciv-stop-grace-'), groupExitTimeoutMs: 0})
    const live = await provider.create({})
    const agent = await live.process.spawn(`(trap '' TERM; echo ready; exec sleep 600) & wait`)
    onTestFinished(() => agent.kill('SIGKILL'))
    expect((await agent.stdout[Symbol.asyncIterator]().next()).value).toBe('ready\n')
    await provider.destroy({id: live.id})
    await vi.waitFor(() => expect(groupAlive(agent.pid)).toBe(false))
  })
})
