import {describe, expect, it} from 'vitest'
import {createEngine} from '@conciv/core/testing'
import {cli} from '../test/cli.js'

describe('session', () => {
  it('a bad CONCIV_SESSION_ID is refused, and an asking tool run in the named session waits until it is approved', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})
    await engine.newSession('Later work')

    const refused = await cli(['tools', 'shelf', 'label', 'fern'], {engine, env: {CONCIV_SESSION_ID: 'not-a-session'}})
    expect(refused.exitCode).toBe(1)
    expect(JSON.parse(refused.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: 'CONCIV_SESSION_ID is not a conciv session id: "not-a-session"',
        hint: 'Unset it, or set it to the ses_… id the engine handed your terminal.',
      },
    })

    const restocking = cli(['tools', 'shelf', 'restock', 'fern'], {engine, env: {CONCIV_SESSION_ID: engine.session.id}})
    await engine.session.approve()

    const restocked = await restocking
    expect(restocked.exitCode).toBe(0)
    expect(JSON.parse(restocked.stdout)).toEqual({ok: true, data: {plant: 'fern', restocked: true}})
  })
})
