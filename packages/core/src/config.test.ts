import {ConfigProvider} from 'effect'
import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'
import {resolveConfig} from './config.js'

describe('config', () => {
  test('an engine started for one session has that session from the start', async () => {
    const sessionId = 'conciv_11111111-1111-4111-8111-111111111111'
    const engine = await createEngine({sessionId})

    expect(engine.session.id).toBe(sessionId)
  })

  test.each([
    [
      'the environment fills what the config leaves out',
      {},
      {stateRoot: '/state/from-env', harness: 'codex', sessionId: 'conciv_22222222-2222-4222-8222-222222222222'},
    ],
    [
      'the config wins over the environment',
      {stateRoot: '/state/from-config', harness: 'gemini', sessionId: 'conciv_33333333-3333-4333-8333-333333333333'},
      {stateRoot: '/state/from-config', harness: 'gemini', sessionId: 'conciv_33333333-3333-4333-8333-333333333333'},
    ],
  ])('%s', (_label, options, expected) => {
    const env = ConfigProvider.fromEnvRecord({
      CONCIV_STATE_ROOT: '/state/from-env',
      CONCIV_HARNESS: 'codex',
      CONCIV_SESSION_ID: 'conciv_22222222-2222-4222-8222-222222222222',
    })

    expect(resolveConfig(options, '/project', env)).toMatchObject(expected)
  })

  test('with neither config nor environment the project folder holds the state and the harness is claude', () => {
    expect(resolveConfig({}, '/project', ConfigProvider.fromEnvRecord({}))).toMatchObject({
      stateRoot: '/project',
      harness: 'claude',
      sessionId: undefined,
    })
  })
})
