import {join} from 'node:path'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import type {EngineStaleness} from '@conciv/contract'
import type {HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'
import type {RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import type {RpcWireWatch} from '@conciv/extension-testkit/rpc-wire'

export type BootCoreInput = {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  connect?: boolean
  terminal?: boolean
  history?: HarnessSessionMeta[]
  allowedOrigins?: string[]
}

export type BootCoreResult = {base: string; wsBase: string; bootMs: number}

export type FaultSpec =
  | {kind: 'fail'; path: string[]; status?: number}
  | {kind: 'abort'; path?: string[]}
  | {kind: 'gate'; path?: string[]}
  | {kind: 'chat-refused'; status?: number}
  | {kind: 'chat-dropped'}

type Fault = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
  answered: () => Promise<void>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

type CoreTestkit = typeof import('./core-testkit.js')

type TerminalState = {launches: number; succeeds: boolean}

type FileState = {
  kit: CoreKit | null
  staleness: {value: EngineStaleness}
  faults: Map<string, Fault>
  handles: {count: number}
  terminal: TerminalState
  calls: RpcCallCursor | null
  wire: RpcWireWatch | null
}

const FRESH: EngineStaleness = {
  stale: false,
  changed: [],
  tracked: ['@conciv/core'],
  bootedAt: 0,
  fingerprint: 'testkit0000',
}

const AWAIT_RPC_TIMEOUT_MS = 15_000

const files = new Map<string, FileState>()

function testkitOf(ctx: BrowserCommandContext): Promise<CoreTestkit> {
  const nodeProject = ctx.project.vitest.getRootProject()
  return nodeProject.import<CoreTestkit>(join(ctx.project.config.root, 'test/commands/core-testkit.ts'))
}

function stateOf(ctx: BrowserCommandContext): FileState {
  const key = ctx.testPath ?? 'shared'
  const existing = files.get(key)
  if (existing) return existing
  const created: FileState = {
    kit: null,
    staleness: {value: FRESH},
    faults: new Map(),
    handles: {count: 0},
    terminal: {launches: 0, succeeds: true},
    calls: null,
    wire: null,
  }
  files.set(key, created)
  return created
}

function kitOf(ctx: BrowserCommandContext): CoreKit {
  const kit = stateOf(ctx).kit
  if (!kit) throw new Error('no core is booted for this test file; call bootCore first')
  return kit
}

function wireOf(ctx: BrowserCommandContext): RpcWireWatch {
  const wire = stateOf(ctx).wire
  if (!wire) throw new Error('no core is booted for this test file; call bootCore first')
  return wire
}

function callsOf(ctx: BrowserCommandContext): RpcCallCursor {
  const calls = stateOf(ctx).calls
  if (!calls) throw new Error('no core is booted for this test file; call bootCore first')
  return calls
}

function faultOf(ctx: BrowserCommandContext, handle: string): Fault {
  const fault = stateOf(ctx).faults.get(handle)
  if (!fault) throw new Error(`no fault is installed under the handle "${handle}"`)
  return fault
}

const bootCore: BrowserCommand<[BootCoreInput]> = async (ctx, input): Promise<BootCoreResult> => {
  const state = stateOf(ctx)
  if (state.kit) throw new Error('a core is already booted for this test file; call closeCore first')
  const startedAt = Date.now()
  const openedTerminal = (): Promise<boolean> => {
    state.terminal.launches += 1
    return Promise.resolve(state.terminal.succeeds)
  }
  const {bootCoreKit, createTerminalExtension, rpcCallCursor, watchRpcWire} = await testkitOf(ctx)
  const kit = await bootCoreKit({
    id: input.id,
    text: input.text,
    resume: input.resume,
    displayName: input.displayName,
    history: input.history,
    allowedOrigins: input.allowedOrigins,
    staleness: () => state.staleness.value,
    ...(input.terminal ? {extensions: [createTerminalExtension({openTerminal: openedTerminal})]} : {}),
    ...(input.connect
      ? {
          connect: {
            plan: (context) => ({
              argv: ['claude', '--resume', context.harnessSessionId ?? 'new'],
              env: {},
              files: [],
            }),
          },
        }
      : {}),
  })
  state.kit = kit
  state.calls = rpcCallCursor(ctx.page)
  state.wire = watchRpcWire(ctx.page)
  return {base: kit.base, wsBase: kit.wsBase, bootMs: Date.now() - startedAt}
}

const closeCore: BrowserCommand<[]> = async (ctx): Promise<void> => {
  const state = stateOf(ctx)
  for (const fault of state.faults.values()) await fault.dispose()
  state.faults.clear()
  state.staleness.value = FRESH
  state.terminal.launches = 0
  state.terminal.succeeds = true
  state.calls = null
  state.wire = null
  const kit = state.kit
  state.kit = null
  if (!kit) return
  kit.harness.script.release()
  await kit.cleanup()
}

const setStaleness: BrowserCommand<[EngineStaleness]> = (ctx, value): void => {
  stateOf(ctx).staleness.value = value
}

const holdTurn: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.hold()
}

const releaseTurn: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.release()
}

const holdTools: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.holdTools()
}

const releaseTools: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.releaseTools()
}

const holdResults: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.holdResults()
}

const releaseResults: BrowserCommand<[PacedRelease?]> = (ctx, paced): void => {
  kitOf(ctx).harness.script.releaseResults(paced)
}

const scriptError: BrowserCommand<[string]> = (ctx, message): void => {
  kitOf(ctx).harness.script.scriptError(message)
}

const scriptTurn: BrowserCommand<[ScriptedTurn]> = (ctx, turn): string[] => kitOf(ctx).harness.script.scriptTurn(turn)

const scriptToolCall: BrowserCommand<[string, unknown]> = (ctx, name, input): string =>
  kitOf(ctx).harness.script.scriptToolCall(name, input)

const scriptCustomEvent: BrowserCommand<[string, unknown]> = (ctx, name, value): void => {
  kitOf(ctx).harness.script.scriptCustomEvent(name, value)
}

const setTerminalLaunch: BrowserCommand<[boolean]> = (ctx, succeeds): void => {
  stateOf(ctx).terminal.succeeds = succeeds
}

const terminalLaunches: BrowserCommand<[]> = (ctx): number => stateOf(ctx).terminal.launches

const rpcCallCount: BrowserCommand<[string[]]> = (ctx, path): number => callsOf(ctx).completedSince(path)

const rpcMark: BrowserCommand<[]> = async (ctx): Promise<number> => {
  const {rpcCallMark} = await testkitOf(ctx)
  return rpcCallMark(ctx.page)
}

const awaitFaultAnswered: BrowserCommand<[string]> = (ctx, handle): Promise<void> => faultOf(ctx, handle).answered()

const awaitWarmSessionResolved: BrowserCommand<[number]> = (ctx, since): Promise<number | null> =>
  wireOf(ctx).sessionsResolvedSince(since)

const awaitSessionsListed: BrowserCommand<[number]> = (ctx, since): Promise<number | null> =>
  wireOf(ctx).sessionsListedSince(since)

type Injector = {repair: () => void; dispose: () => Promise<void>; answered?: () => Promise<void>}

function trackedFault(handle: string, kind: FaultSpec['kind'], injector: Injector): Fault {
  const answered = injector.answered
  return {
    pending: () => 0,
    answered: () =>
      answered
        ? answered()
        : Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which answers no single rpc call`)),
    awaitCaptured: () =>
      Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which never captures pending requests`)),
    release: () => {
      injector.repair()
      return Promise.resolve()
    },
    dispose: injector.dispose,
  }
}

const installFault: BrowserCommand<[FaultSpec]> = async (ctx, spec): Promise<string> => {
  const state = stateOf(ctx)
  const {abortRpcCalls, dropChatTurns, failChatTurns, failRpcCalls, gateRpcCalls} = await testkitOf(ctx)
  state.handles.count += 1
  const handle = `fault-${state.handles.count}`
  if (spec.kind === 'gate') {
    state.faults.set(handle, await gateRpcCalls(ctx.page, spec.path ? {path: spec.path} : {}))
    return handle
  }
  if (spec.kind === 'chat-dropped') {
    state.faults.set(handle, trackedFault(handle, spec.kind, await dropChatTurns(ctx.page)))
    return handle
  }
  if (spec.kind === 'chat-refused') {
    const injected = await failChatTurns(ctx.page, spec.status ? {status: spec.status} : {})
    state.faults.set(handle, trackedFault(handle, spec.kind, injected))
    return handle
  }
  const injector =
    spec.kind === 'abort'
      ? await abortRpcCalls(ctx.page, spec.path ? {path: spec.path} : {})
      : await failRpcCalls(ctx.page, {path: spec.path, ...(spec.status ? {status: spec.status} : {})})
  state.faults.set(handle, trackedFault(handle, spec.kind, injector))
  return handle
}

const releaseFault: BrowserCommand<[string]> = async (ctx, handle): Promise<void> => {
  await faultOf(ctx, handle).release()
}

const faultPending: BrowserCommand<[string]> = (ctx, handle): number => faultOf(ctx, handle).pending()

const awaitFaultPending: BrowserCommand<[string, number]> = async (ctx, handle, count): Promise<void> => {
  const timer: {value: ReturnType<typeof setTimeout> | null} = {value: null}
  const deadline = new Promise<never>((_, reject) => {
    timer.value = setTimeout(
      () =>
        reject(
          new Error(
            `the fault "${handle}" captured ${faultOf(ctx, handle).pending()} of ${count} pending requests within ${AWAIT_RPC_TIMEOUT_MS}ms`,
          ),
        ),
      AWAIT_RPC_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([faultOf(ctx, handle).awaitCaptured(count), deadline])
  } finally {
    if (timer.value) clearTimeout(timer.value)
  }
}

export const coreCommands = {
  bootCore,
  closeCore,
  setStaleness,
  holdTurn,
  holdTools,
  releaseTools,
  holdResults,
  releaseResults,
  releaseTurn,
  scriptError,
  scriptTurn,
  scriptToolCall,
  scriptCustomEvent,
  setTerminalLaunch,
  terminalLaunches,
  rpcCallCount,
  rpcMark,
  awaitFaultAnswered,
  awaitWarmSessionResolved,
  awaitSessionsListed,
  installFault,
  releaseFault,
  faultPending,
  awaitFaultPending,
}
