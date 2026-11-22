import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {opencode} from './index.js'

describe('opencode', () => {
  it('resumes a session with opencode --session <id>', () => {
    const harness = opencode(ConfigProvider.fromEnvRecord({}))

    expect(harness.resume.command({cwd: '/workspace', nativeId: HarnessSessionId.parse('ses_1')})).toEqual({
      bin: 'opencode',
      args: ['--session', 'ses_1'],
    })
  })
})
