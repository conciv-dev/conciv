import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'vitest'
import {claude} from '@conciv/harness/claude'
import {assertTurnAndResume} from './helpers/harness-turn.js'

const runReal = !process.env.CI

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-tanstack-')))

describe('claude through claudeCodeText + conciv sandbox/gate', () => {
  it.skipIf(!runReal)(
    'streams a real turn and resumes the session',
    () => assertTurnAndResume({harness: claude, dir, sessionId: 'it-1', sessionEvent: 'claude-code.session-id'}),
    120_000,
  )
})
