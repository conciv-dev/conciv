import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'vitest'
import {codex} from '@conciv/harness/codex'
import {harnessAvailable} from '@conciv/harness-testkit'
import {assertTurnAndResume} from './helpers/harness-turn.js'

const runReal = !process.env.CI && harnessAvailable(codex)

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-tanstack-')))

describe('codex through codexText + conciv sandbox/gate', () => {
  it.skipIf(!runReal)(
    'streams a real turn and resumes the session',
    () => assertTurnAndResume({harness: codex, dir, sessionId: 'it-codex-1', sessionEvent: 'codex.session-id'}),
    120_000,
  )
})
