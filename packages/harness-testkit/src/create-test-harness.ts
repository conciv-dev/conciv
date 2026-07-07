import type {HarnessAdapter, HarnessChatDeps} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type TestHarness = HarnessAdapter & {__scripted: ScriptedRun}

export function createTestHarness(real: HarnessAdapter): TestHarness {
  const scripted = makeScriptedRun()
  return Object.assign({}, real, {
    chatConfig: (deps: HarnessChatDeps) => ({
      adapter: makeTextAdapter('scripted', () => scripted.chatStream(deps)),
    }),
    __scripted: scripted,
  })
}
