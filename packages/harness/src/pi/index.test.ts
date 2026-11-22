import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {pi} from './index.js'

describe('pi', () => {
  it('resumes a session with pi --session <id>', () => {
    const harness = pi(ConfigProvider.fromEnvRecord({}))

    expect(harness.resume.command({cwd: '/workspace', nativeId: HarnessSessionId.parse('ses_1')})).toEqual({
      bin: 'pi',
      args: ['--session', 'ses_1'],
    })
  })
})
