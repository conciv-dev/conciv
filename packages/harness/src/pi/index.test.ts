import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {pi} from './index.js'

describe('pi', () => {
  it('offers no models, terminal or slash menu, and resumes with pi --session', () => {
    const harness = pi(ConfigProvider.fromEnvRecord({}))

    expect(harness).toMatchObject({
      models: undefined,
      tty: undefined,
      commands: undefined,
      capabilities: {slashCommands: 'none'},
    })
    expect(harness.resume.command({cwd: '/workspace', nativeId: HarnessSessionId.parse('ses_1')})).toEqual({
      bin: 'pi',
      args: ['--session', 'ses_1'],
    })
  })
})
