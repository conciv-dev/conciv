import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type TestHarness = HarnessAdapter & {__scripted: ScriptedRun}

export function createTestHarness(real: HarnessAdapter): TestHarness {
  const scripted = makeScriptedRun()
  return Object.assign({}, real, {
    run: scripted.run,
    shutdown: () => {},
    release: () => {},
    __scripted: scripted,
  })
}
