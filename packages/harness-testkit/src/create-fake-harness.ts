import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {
  defineHarness,
  type HarnessAdapter,
  type HarnessConnectContext,
  type HarnessModel,
} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  script: ScriptedRun
}

export function createFakeHarness(
  opts: {
    id?: string
    text?: string
    models?: HarnessModel[]
    tty?: {command(ctx: HarnessConnectContext): TtyCommand}
  } = {},
): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  return Object.assign(
    defineHarness({
      id,
      binName: 'true',
      chatConfig: (deps) => ({
        adapter: makeTextAdapter(id, () => scripted.chatStream(deps)),
      }),
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: false,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
      },
      models: opts.models,
      tty: opts.tty,
    }),
    {script: scripted},
  )
}
