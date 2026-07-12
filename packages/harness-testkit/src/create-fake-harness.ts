import type {TextOptions} from '@tanstack/ai'
import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  __scripted: ScriptedRun
  __turnMessages: TextOptions<Record<string, never>>['messages'][]
}

export function createFakeHarness(
  opts: {id?: string; text?: string; tty?: {command(opts: TtyCommandOpts): TtyCommand}} = {},
): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  const turnMessages: TextOptions<Record<string, never>>['messages'][] = []
  return Object.assign(
    defineHarness({
      id,
      binName: 'true',
      chatConfig: (deps) => ({
        adapter: makeTextAdapter(id, (options) => {
          turnMessages.push(options.messages)
          return scripted.chatStream(deps)
        }),
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
      tty: opts.tty,
    }),
    {__scripted: scripted, __turnMessages: turnMessages},
  )
}
