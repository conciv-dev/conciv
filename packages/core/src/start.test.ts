import {describe, expect, test} from 'vitest'
import {cli, createEngine} from '@conciv/plugin-testkit'

describe('start', () => {
  test('a malformed access token is refused at start', async () => {
    await expect(createEngine({}, {port: 'connect', token: 'not-a-uuid'})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )
  })

  test('the started engine is found from its project folder', async () => {
    const engine = await createEngine()

    const linked = await cli(['auth', 'link', 'http://localhost:3001/'], {cwd: engine.root})

    expect(linked.exitCode).toBe(0)
    expect(linked.stdout).toMatch(/http:\/\/localhost:3001\/#conciv_otp=\d{6}/)
  })
})
