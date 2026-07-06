import {describe, expect, it} from 'vitest'
import {claudeSdkCommands, __commandsCacheSet} from '../src/claude/sdk.js'

describe('claudeSdkCommands', () => {
  it('serves the per-cwd cache without probing', async () => {
    __commandsCacheSet('/tmp/fake-project', [{name: 'compact', description: 'Compact the context'}])
    const commands = await claudeSdkCommands({cwd: '/tmp/fake-project'})
    expect(commands).toEqual([{name: 'compact', description: 'Compact the context'}])
  })
})
