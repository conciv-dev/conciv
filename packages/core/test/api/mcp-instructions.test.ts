import {describe, expect, it} from 'vitest'
import {serverInstructions} from '../../src/api/mcp.js'

const FRESH = {stale: false, changed: [], tracked: ['@conciv/core'], bootedAt: 0, fingerprint: 'aaaa1111'}
const STALE = {
  stale: true,
  changed: ['@conciv/tools'],
  tracked: ['@conciv/core', '@conciv/tools'],
  bootedAt: 0,
  fingerprint: 'bbbb2222',
}

describe('mcp server instructions', () => {
  it('says nothing about staleness while the engine matches the code on disk', () => {
    const text = serverInstructions(['page'], FRESH)

    expect(text).not.toMatch(/outdated|restart the dev server/i)
  })

  it('warns that the loaded server code is behind the disk and names what changed', () => {
    const text = serverInstructions(['page'], STALE)

    expect(text).toMatch(/server code on disk is newer than the running engine/i)
    expect(text).toMatch(/restart the dev server/i)
    expect(text).toContain('@conciv/tools')
  })

  it('still describes the sandbox workflow while it is warning about staleness', () => {
    const text = serverInstructions(['page'], STALE)

    expect(text).toContain('execute_typescript')
    expect(text).toContain('external_catalog')
  })
})
