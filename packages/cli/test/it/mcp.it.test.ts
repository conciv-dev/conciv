import {describe, expect, it} from 'vitest'
import {cli} from '@conciv/plugin-testkit'
import {tempDir} from '@internal/vitest-config/temp-dir'

describe('mcp', () => {
  it('on a machine with no claude CLI, connect claude says why it failed, list stays empty, and disconnect claude notes the entry it could not remove', async () => {
    const env = {PATH: '/usr/bin:/bin', CONCIV_HOME: tempDir('mcp-home-')}

    expect(JSON.parse((await cli(['mcp', 'list'], {env})).stdout)).toMatchObject({ok: true, data: []})

    expect(JSON.parse((await cli(['mcp', 'connect', 'claude'], {env})).stdout)).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('claude')},
    })

    expect(JSON.parse((await cli(['mcp', 'list'], {env})).stdout)).toMatchObject({ok: true, data: []})

    expect(JSON.parse((await cli(['mcp', 'disconnect', 'claude'], {env})).stdout)).toMatchObject({
      ok: true,
      data: {disconnected: 'claude', note: expect.stringContaining('could not remove its conciv-hub entry')},
    })
  })
})
