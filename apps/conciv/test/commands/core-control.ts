import {join} from 'node:path'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import {makeRpcClient, type EngineStaleness} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {HarnessCommand, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'
import type {RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import type {PushWireWatch} from '@conciv/extension-testkit/push-wire'
import type {CallCompletion, CallGate} from '@conciv/extension-testkit/devframe-faults'

export type BootCoreInput = {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  connect?: boolean
  terminal?: boolean
  history?: HarnessSessionMeta[]
  commands?: HarnessCommand[]
  allowedOrigins?: string[]
}

export type BootCoreResult = {base: string; wsBase: string; bootMs: number}

export type HubMessageInput = {message: string; level: 'info' | 'warn' | 'error' | 'success'; notify: boolean}

export type HubCommandInput = {id: string; title: string; reply: HubMessageInput}

export type FaultSpec =
  | {kind: 'fail'; path: string[]; status?: number}
  | {kind: 'abort'; path?: string[]}
  | {kind: 'gate'; path?: string[]}
  | {kind: 'chat-refused'; status?: number}
  | {kind: 'hub-fail'; names: string[]; code?: string}
  | {kind: 'hub-abort'; names: string[]}
  | {kind: 'hub-gate'; names: string[]}
  | {kind: 'hub-completed'; names: string[]}

type Fault = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
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
  push: PushWireWatch | null
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
    push: null,
  }
  files.set(key, created)
  return created
}

function kitOf(ctx: BrowserCommandContext): CoreKit {
  const kit = stateOf(ctx).kit
  if (!kit) throw new Error('no core is booted for this test file; call bootCore first')
  return kit
}

function pushOf(ctx: BrowserCommandContext): PushWireWatch {
  const push = stateOf(ctx).push
  if (!push) throw new Error('no core is booted for this test file; call bootCore first')
  return push
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
  const {bootCoreKit, createTerminalExtension, rpcCallCursor, watchPushWire} = await testkitOf(ctx)
  const kit = await bootCoreKit({
    id: input.id,
    text: input.text,
    resume: input.resume,
    displayName: input.displayName,
    history: input.history,
    commands: input.commands,
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
  state.push = watchPushWire(ctx.page)
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
  state.push = null
  const kit = state.kit
  state.kit = null
  if (!kit) return
  kit.harness.script.release()
  await kit.cleanup()
}

const pushSocketsOpened: BrowserCommand<[]> = (ctx): number => pushOf(ctx).opened()

const outsideReload: BrowserCommand<[string, string]> = (ctx, sessionId, file): Promise<string> => {
  const rpc = makeRpcClient(kitOf(ctx).base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  return rpc.server.reload({file}).then(
    () => 'resolved',
    (error: unknown) => (typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'error'),
  )
}

const addHubMessage: BrowserCommand<[HubMessageInput]> = async (ctx, input): Promise<void> => {
  const context = await kitOf(ctx).hubInstance.context
  await context.messages.add(input)
}

const registerHubCommand: BrowserCommand<[HubCommandInput]> = async (ctx, input): Promise<void> => {
  const context = await kitOf(ctx).hubInstance.context
  context.commands.register({
    id: input.id,
    title: input.title,
    handler: () => context.messages.add(input.reply),
  })
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

const scriptTurn: BrowserCommand<[ScriptedTurn]> = (ctx, turn): string[] => kitOf(ctx).harness.script.scriptTurn(turn)

const clearScript: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.clearScript()
}

const scriptCustomEvent: BrowserCommand<[string, unknown]> = (ctx, name, value): void => {
  kitOf(ctx).harness.script.scriptCustomEvent(name, value)
}

const setTerminalLaunch: BrowserCommand<[boolean]> = (ctx, succeeds): void => {
  stateOf(ctx).terminal.succeeds = succeeds
}

const terminalLaunches: BrowserCommand<[]> = (ctx): number => stateOf(ctx).terminal.launches

const rpcCallCount: BrowserCommand<[string[]]> = (ctx, path): number => callsOf(ctx).completedSince(path)

type Injector = {repair: () => void; dispose: () => Promise<void>}

function trackedFault(handle: string, kind: FaultSpec['kind'], injector: Injector): Fault {
  return {
    pending: () => 0,
    awaitCaptured: () =>
      Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which never captures pending requests`)),
    release: () => {
      injector.repair()
      return Promise.resolve()
    },
    dispose: injector.dispose,
  }
}

function hubGateFault(gate: CallGate): Fault {
  const arrival = {count: 0}
  void gate.arrived.then(() => {
    arrival.count = 1
  })
  return {
    pending: () => arrival.count,
    awaitCaptured: (count) =>
      count <= 1 ? gate.arrived : Promise.reject(new Error('a hub gate reports only its first arrival')),
    release: async () => gate.release(),
    dispose: async () => gate.release(),
  }
}

function hubCompletedWatch(completion: CallCompletion): Fault {
  const completed = {count: 0}
  void completion.completed.then(() => {
    completed.count = 1
  })
  return {
    pending: () => completed.count,
    awaitCaptured: (count) =>
      count <= 1
        ? completion.completed
        : Promise.reject(new Error('a hub completion watch reports only its first call')),
    release: async () => completion.stop(),
    dispose: async () => completion.stop(),
  }
}

type HubFaultSpec = Extract<FaultSpec, {kind: 'hub-gate' | 'hub-fail' | 'hub-abort' | 'hub-completed'}>

function isHubFault(spec: FaultSpec): spec is HubFaultSpec {
  return spec.kind.startsWith('hub-')
}

async function hubFault(ctx: BrowserCommandContext, handle: string, spec: HubFaultSpec): Promise<Fault> {
  const {abortCalls, awaitCompletedCall, failCalls, gateCalls} = await testkitOf(ctx)
  if (spec.kind === 'hub-gate') return hubGateFault(await gateCalls(kitOf(ctx), spec.names))
  if (spec.kind === 'hub-completed') return hubCompletedWatch(await awaitCompletedCall(kitOf(ctx), spec.names))
  const fault =
    spec.kind === 'hub-abort'
      ? await abortCalls(kitOf(ctx), spec.names)
      : await failCalls(kitOf(ctx), spec.names, spec.code)
  return trackedFault(handle, spec.kind, {repair: fault.repair, dispose: async () => fault.repair()})
}

const installFault: BrowserCommand<[FaultSpec]> = async (ctx, spec): Promise<string> => {
  const state = stateOf(ctx)
  const {abortRpcCalls, failChatTurns, failRpcCalls, gateRpcCalls} = await testkitOf(ctx)
  state.handles.count += 1
  const handle = `fault-${state.handles.count}`
  if (isHubFault(spec)) {
    state.faults.set(handle, await hubFault(ctx, handle, spec))
    return handle
  }
  if (spec.kind === 'gate') {
    state.faults.set(handle, await gateRpcCalls(ctx.page, spec.path ? {path: spec.path} : {}))
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
  pushSocketsOpened,
  outsideReload,
  addHubMessage,
  registerHubCommand,
  setStaleness,
  holdTurn,
  holdTools,
  releaseTools,
  holdResults,
  releaseResults,
  releaseTurn,
  scriptTurn,
  clearScript,
  scriptCustomEvent,
  setTerminalLaunch,
  terminalLaunches,
  rpcCallCount,
  installFault,
  releaseFault,
  faultPending,
  awaitFaultPending,
}
