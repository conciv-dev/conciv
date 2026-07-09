import type {TextOptions} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChatDeps} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type TestHarness = HarnessAdapter & {
  __scripted: ScriptedRun
  __turnMessages: TextOptions<Record<string, never>>['messages'][]
}

export function createTestHarness(real: HarnessAdapter): TestHarness {
  const scripted = makeScriptedRun()
  const turnMessages: TextOptions<Record<string, never>>['messages'][] = []
  return Object.assign({}, real, {
    chatConfig: (deps: HarnessChatDeps) => ({
      adapter: makeTextAdapter('scripted', (options) => {
        turnMessages.push(options.messages)
        return scripted.chatStream(deps)
      }),
    }),
    __scripted: scripted,
    __turnMessages: turnMessages,
  })
}
