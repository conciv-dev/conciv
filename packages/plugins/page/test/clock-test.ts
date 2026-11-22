import {test as base, vi, type TestAPI, type VitestUtils} from 'vitest'

type ClockFixtures = {clock: VitestUtils}

export const test: TestAPI<ClockFixtures> = base.extend<ClockFixtures>({
  clock: async ({task: _task}, use) => {
    await use(vi.useFakeTimers())
    vi.useRealTimers()
  },
})
