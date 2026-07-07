import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'vitest'
import {geminiCli} from '@conciv/harness/gemini-cli'
import {harnessAvailable} from '@conciv/harness-testkit'
import {assertTurnAndResume} from './helpers/harness-turn.js'

const runReal = !process.env.CI && harnessAvailable(geminiCli)

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'gemini-tanstack-')))

describe('gemini-cli through acpCompatible + conciv sandbox/gate', () => {
  it.skipIf(!runReal)(
    'streams a real turn and resumes the session',
    () =>
      assertTurnAndResume({harness: geminiCli, dir, sessionId: 'it-gemini-1', sessionEvent: 'gemini-cli.session-id'}),
    180_000,
  )
})
