import {ConfigProvider} from 'effect'
import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'
import {resolveConfig, type ConcivConfig} from '../../src/backend.js'

describe('config', () => {
  test('an engine started for one session has that session from the start', async ({createEngine, connect}) => {
    const sessionId = 'ses_11111111-1111-4111-8111-111111111111'
    const engine = await createEngine({sessionId})

    expect(await connect(engine).sessions.resolve({})).toEqual({sessionId})
  })

  const fromEnv = {
    CONCIV_STATE_ROOT: '/state/from-env',
    CONCIV_HARNESS: 'codex',
    CONCIV_SESSION_ID: 'ses_22222222-2222-4222-8222-222222222222',
    CONCIV_LOG_LEVEL: 'DEBUG',
  }

  const rows: Array<[string, ConcivConfig, Record<string, string>, Record<string, unknown>]> = [
    [
      'the environment fills what the config leaves out',
      {},
      fromEnv,
      {
        stateRoot: '/state/from-env',
        harness: 'codex',
        sessionId: 'ses_22222222-2222-4222-8222-222222222222',
        logLevel: 'debug',
      },
    ],
    [
      'the config wins over the environment, except the log level, where the environment wins',
      {
        stateRoot: '/state/from-config',
        harness: 'gemini',
        sessionId: 'ses_33333333-3333-4333-8333-333333333333',
        logLevel: 'warn',
      },
      fromEnv,
      {
        stateRoot: '/state/from-config',
        harness: 'gemini',
        sessionId: 'ses_33333333-3333-4333-8333-333333333333',
        logLevel: 'debug',
      },
    ],
    [
      'with neither config nor environment the project folder holds the state, the harness is claude and logs are off',
      {},
      {},
      {stateRoot: '/project', harness: 'claude', sessionId: undefined, logLevel: 'off'},
    ],
  ]

  test.each(rows)('%s', (_label, options, env, expected) => {
    expect(resolveConfig(options, '/project', ConfigProvider.fromEnvRecord(env))).toMatchObject(expected)
  })
})
