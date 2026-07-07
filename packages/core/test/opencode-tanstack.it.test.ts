import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'vitest'
import {opencode} from '@conciv/harness/opencode'
import {harnessAvailable} from '@conciv/harness-testkit'
import {assertTurnAndResume} from './helpers/harness-turn.js'

const optIn = process.env.CONCIV_OPENCODE_IT === '1'
const runReal = !process.env.CI && optIn && harnessAvailable(opencode)

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-tanstack-')))

describe('opencode through opencodeText + conciv sandbox/gate (opt-in: CONCIV_OPENCODE_IT=1 + a funded opencode provider)', () => {
  it.skipIf(!runReal)(
    'streams a real turn and resumes the session',
    () =>
      assertTurnAndResume({
        harness: opencode,
        dir,
        sessionId: 'it-opencode-1',
        sessionEvent: 'opencode.session-id',
        ...(process.env.CONCIV_OPENCODE_IT_MODEL ? {model: process.env.CONCIV_OPENCODE_IT_MODEL} : {}),
      }),
    180_000,
  )
})
