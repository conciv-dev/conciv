import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {
  defineHarness,
  type HarnessAdapter,
  type HarnessCommand,
  type HarnessConnect,
  type HarnessConnectContext,
  type HarnessHistory,
  type HarnessModel,
  type HarnessSessionMeta,
} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  script: ScriptedRun
}

const BASE_CAPABILITIES = {
  resume: false,
  permissionGate: 'none',
  compaction: false,
  systemPrompt: 'none',
  mcp: 'none',
  imageInput: false,
  init: 'none',
} as const

type SharedFields = {
  id: string
  binName: string
  displayName?: string
  connect?: HarnessConnect
  chatConfig: HarnessAdapter['chatConfig']
  models: HarnessModel[] | undefined
  tty: {command(ctx: HarnessConnectContext): TtyCommand} | undefined
}

function fixtureHistory(rows: HarnessSessionMeta[]): HarnessHistory {
  return {
    list: () => Promise.resolve(rows),
    messages: () => Promise.resolve([]),
    meta: (_cwd, sessionId) => Promise.resolve(rows.find((row) => row.id === sessionId) ?? null),
    observe: () => ({
      revision: () => Promise.resolve({ok: false as const, reason: 'missing' as const, detail: 'fixture history'}),
      read: () => Promise.resolve({ok: false as const, reason: 'missing' as const, detail: 'fixture history'}),
      close: () => {},
    }),
  }
}

function buildAdapter(
  shared: SharedFields,
  base: Omit<typeof BASE_CAPABILITIES, 'resume'> & {resume: boolean},
  history: HarnessHistory | undefined,
  commands: HarnessCommand[] | undefined,
): HarnessAdapter {
  const listCommands = commands ? () => Promise.resolve(commands) : undefined
  if (history && listCommands) {
    return defineHarness({
      ...shared,
      capabilities: {...base, transcriptHistory: true, slashCommands: 'live'},
      history,
      commands: listCommands,
    })
  }
  if (history) {
    return defineHarness({
      ...shared,
      capabilities: {...base, transcriptHistory: true, slashCommands: 'none'},
      history,
    })
  }
  if (listCommands) {
    return defineHarness({
      ...shared,
      capabilities: {...base, transcriptHistory: false, slashCommands: 'live'},
      commands: listCommands,
    })
  }
  return defineHarness({
    ...shared,
    capabilities: {...base, transcriptHistory: false, slashCommands: 'none'},
  })
}

export function createFakeHarness(
  opts: {
    id?: string
    text?: string
    resume?: boolean
    displayName?: string
    connect?: HarnessConnect
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    history?: HarnessSessionMeta[]
    tty?: {command(ctx: HarnessConnectContext): TtyCommand}
  } = {},
): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  const shared: SharedFields = {
    id,
    binName: 'true',
    ...(opts.displayName ? {displayName: opts.displayName} : {}),
    ...(opts.connect ? {connect: opts.connect} : {}),
    chatConfig: (deps) => ({adapter: makeTextAdapter(id, (options) => scripted.chatStream(deps, options))}),
    models: opts.models,
    tty: opts.tty,
  }
  const capabilities = {...BASE_CAPABILITIES, resume: opts.resume ?? false}
  const adapter = buildAdapter(
    shared,
    capabilities,
    opts.history ? fixtureHistory(opts.history) : undefined,
    opts.commands,
  )
  return Object.assign(adapter, {script: scripted})
}
