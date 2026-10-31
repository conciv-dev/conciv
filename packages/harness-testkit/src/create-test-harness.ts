import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import type {HarnessAdapter} from '@conciv/harness'
import {makeTextAdapter} from '@conciv/ai/server'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type TestHarness = HarnessAdapter & {
  script: ScriptedRun
}

export function createTestHarness(real: HarnessAdapter): TestHarness {
  const scripted = makeScriptedRun()
  return Object.assign({}, real, {
    chatConfig: (deps: HarnessChatDeps) => ({
      adapter: makeTextAdapter('scripted', (options) => scripted.chatStream(deps, options)),
    }),
    script: scripted,
  })
}
