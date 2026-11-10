import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {
  type HarnessCommand,
  type HarnessConnectContext,
  type HarnessHistory,
  type HarnessModel,
  type HarnessResume,
  type HarnessSessionMeta,
} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {omit} from 'es-toolkit'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {pageAfter} from '@conciv/harness/page'
import {makeTextAdapter} from '@conciv/ai/server'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  script: ScriptedRun
  transcripts: TranscriptHold
}

type TranscriptHold = {hold: () => void; release: () => void; wait: () => Promise<void>}

export type FixtureSession = Omit<HarnessSessionMeta, 'cwd'> & {cwd?: string; text?: string; messages?: ChatMessage[]}

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
  chatConfig: HarnessAdapter['chatConfig']
  models: HarnessModel[] | undefined
  tty: {command(ctx: HarnessConnectContext): TtyCommand} | undefined
}

function fixtureHistory(rows: FixtureSession[], transcripts: TranscriptHold): HarnessHistory {
  const metaOf = (row: FixtureSession, cwd: string): HarnessSessionMeta => ({
    ...omit(row, ['text', 'messages']),
    cwd: row.cwd ?? cwd,
  })
  const anotherProject = (cwd: string): boolean => rows.some((row) => row.cwd === cwd)
  const listedIn = (row: FixtureSession, cwd: string): boolean =>
    row.cwd === undefined ? !anotherProject(cwd) : row.cwd === cwd
  const messages: HarnessHistory['messages'] = async (_cwd, sessionId, options) => {
    const row = rows.find((candidate) => candidate.id === sessionId)
    const text = row?.text
    if (row?.messages === undefined && text === undefined) return []
    await transcripts.wait()
    options?.signal?.throwIfAborted()
    return row?.messages ?? [{id: `${sessionId}-text`, role: 'assistant', parts: [{type: 'text', content: text ?? ''}]}]
  }
  return {
    list: (scope, page) => {
      const listed = rows.flatMap((row) => {
        if ('cwd' in scope) return listedIn(row, scope.cwd) ? [metaOf(row, scope.cwd)] : []
        return row.cwd === undefined ? [] : [metaOf(row, row.cwd)]
      })
      const paged = pageAfter(listed, page, (meta) => ({updatedAt: meta.updatedAt, id: meta.id}))
      return Promise.resolve({sessions: paged.items, next: paged.next})
    },
    messages,
    tail: async (cwd, sessionId, {limit, before, signal}) => {
      const all = await messages(cwd, sessionId, {signal})
      const end = before === null ? all.length : Number(before)
      const start = Math.max(0, end - limit)
      return {messages: all.slice(start, end), earlier: start > 0 ? String(start) : null}
    },
    meta: (cwd, sessionId) => {
      const row = rows.find((candidate) => candidate.id === sessionId)
      return Promise.resolve(row === undefined ? null : metaOf(row, cwd))
    },
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
  resume: HarnessResume,
): HarnessAdapter {
  const listCommands = commands ? () => Promise.resolve(commands) : undefined
  if (history && listCommands) {
    return defineHarness({
      ...shared,
      capabilities: {...base, transcriptHistory: true, slashCommands: 'live'},
      history,
      resume,
      commands: listCommands,
    })
  }
  if (history) {
    return defineHarness({
      ...shared,
      capabilities: {...base, transcriptHistory: true, slashCommands: 'none'},
      history,
      resume,
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
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    history?: FixtureSession[]
    tty?: {command(ctx: HarnessConnectContext): TtyCommand}
    resumeBin?: string
  } = {},
): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  const shared: SharedFields = {
    id,
    binName: 'true',
    ...(opts.displayName ? {displayName: opts.displayName} : {}),
    chatConfig: (deps) => ({adapter: makeTextAdapter(id, (options) => scripted.chatStream(deps, options))}),
    models: opts.models,
    tty: opts.tty,
  }
  const capabilities = {...BASE_CAPABILITIES, resume: opts.resume ?? false}
  const transcripts = makeTranscriptHold()
  const adapter = buildAdapter(
    shared,
    capabilities,
    opts.history ? fixtureHistory(opts.history, transcripts) : undefined,
    opts.commands,
    {command: ({nativeId}) => ({bin: opts.resumeBin ?? id, args: ['--resume', nativeId]})},
  )
  return Object.assign(adapter, {script: scripted, transcripts})
}

function makeTranscriptHold(): TranscriptHold {
  const state = {held: Promise.resolve(), release: () => {}}
  return {
    hold: () => {
      const {promise, resolve} = Promise.withResolvers<void>()
      state.held = promise
      state.release = resolve
    },
    release: () => state.release(),
    wait: () => state.held,
  }
}
