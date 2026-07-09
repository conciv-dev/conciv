import {describe, expect, it} from 'vitest'
import {startTestEngine} from '../../helpers/state-plane.js'

describe('engine state plane', () => {
  it('starts trailbase and serves the sessions record api', async () => {
    const engine = await startTestEngine()
    const response = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    await engine.stop()
  }, 120000)
})
