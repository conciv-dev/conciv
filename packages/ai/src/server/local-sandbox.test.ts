import {describe, expect, it, vi} from 'vitest'
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

type Spawned = {pid: number; kill: (signal: NodeJS.Signals) => unknown}

type SandboxFixtures = {frozenDate: void; spawned: <Agent extends Spawned>(agent: Agent) => Agent}

const withFrozenDate = it.extend<SandboxFixtures>({
  frozenDate: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      vi.useFakeTimers({toFake: ['Date']})
      try {
        await use()
      } finally {
        vi.useRealTimers()
      }
    },
    {auto: true},
  ],
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  spawned: async ({}, use) => {
    const agents: Spawned[] = []
    try {
      await use((agent) => {
        agents.push(agent)
        return agent
      })
    } finally {
      agents.forEach((agent) => agent.kill('SIGKILL'))
    }
  },
})

describe('local sandbox stop grace', () => {
  withFrozenDate(
    'kills a child that ignores SIGTERM once the grace it was given is over, on a clock that never moves',
    async ({spawned}) => {
      const provider = localSandbox({dir: tempDir('conciv-stop-grace-'), groupExitTimeoutMs: 0})
      const live = await provider.create({})
      const agent = spawned(await live.process.spawn(`(trap '' TERM; echo ready; exec sleep 600) & wait`))
      expect((await agent.stdout[Symbol.asyncIterator]().next()).value).toBe('ready\n')
      await provider.destroy({id: live.id})
      await vi.waitFor(() => expect(groupAlive(agent.pid)).toBe(false))
    },
  )
})
