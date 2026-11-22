import {ConfigProvider} from 'effect'
import {describe, expect} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../test/engine-test.js'
import {resolveConfig} from './config.js'

describe('config', () => {
  test('an engine started for one session has that session from the start', async ({connect}) => {
    const sessionId = 'conciv_11111111-1111-4111-8111-111111111111'
    const engine = await createEngine({sessionId})

    expect(await connect(engine).sessions.resolve({})).toEqual({sessionId})
  })

  const fromEnv = {
    CONCIV_STATE_ROOT: '/state/from-env',
    CONCIV_HARNESS: 'codex',
    CONCIV_SESSION_ID: 'conciv_22222222-2222-4222-8222-222222222222',
  }

  test.each([
    [
      'the environment fills what the config leaves out',
      {},
      fromEnv,
      {stateRoot: '/state/from-env', harness: 'codex', sessionId: 'conciv_22222222-2222-4222-8222-222222222222'},
    ],
    [
      'the config wins over the environment',
      {stateRoot: '/state/from-config', harness: 'gemini', sessionId: 'conciv_33333333-3333-4333-8333-333333333333'},
      fromEnv,
      {stateRoot: '/state/from-config', harness: 'gemini', sessionId: 'conciv_33333333-3333-4333-8333-333333333333'},
    ],
    [
      'with neither config nor environment the project folder holds the state and the harness is claude',
      {},
      {},
      {stateRoot: '/project', harness: 'claude', sessionId: undefined},
    ],
  ])('%s', (_label, options, env, expected) => {
    expect(resolveConfig(options, '/project', ConfigProvider.fromEnvRecord(env))).toMatchObject(expected)
  })
})
