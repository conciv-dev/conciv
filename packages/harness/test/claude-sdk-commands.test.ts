import {describe, expect, it} from 'vitest'
import {claudeSdkCommands, __commandsCacheSet, __sdkStats} from '../src/claude/sdk.js'

describe('claudeSdkCommands', () => {
  it('serves the per-cwd cache without spawning', async () => {
    __commandsCacheSet('/tmp/fake-project', [{name: 'compact', description: 'Compact the context'}])
    const before = __sdkStats().spawned
    const commands = await claudeSdkCommands({cwd: '/tmp/fake-project'})
    expect(commands).toEqual([{name: 'compact', description: 'Compact the context'}])
    expect(__sdkStats().spawned).toBe(before)
  })
})
