import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {
  defineHarness,
  type HarnessAdapter,
  type HarnessCommand,
  type HarnessConnectContext,
  type HarnessModel,
} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  script: ScriptedRun
}

const BASE_CAPABILITIES = {
  resume: false,
  permissionGate: 'none',
  transcriptHistory: false,
  compaction: false,
  systemPrompt: 'none',
  mcp: 'none',
  imageInput: false,
  init: 'none',
} as const

export function createFakeHarness(
  opts: {
    id?: string
    text?: string
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    tty?: {command(ctx: HarnessConnectContext): TtyCommand}
  } = {},
): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  const commands = opts.commands
  const shared = {
    id,
    binName: 'true',
    chatConfig: (deps: Parameters<HarnessAdapter['chatConfig']>[0]) => ({
      adapter: makeTextAdapter(id, () => scripted.chatStream(deps)),
    }),
    models: opts.models,
    tty: opts.tty,
  }
  const adapter = commands
    ? defineHarness({
        ...shared,
        capabilities: {...BASE_CAPABILITIES, slashCommands: 'live'},
        commands: () => Promise.resolve(commands),
      })
    : defineHarness({
        ...shared,
        capabilities: {...BASE_CAPABILITIES, slashCommands: 'none'},
      })
  return Object.assign(adapter, {script: scripted})
}
