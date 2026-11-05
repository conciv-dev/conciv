import {join} from 'node:path'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import {makeRpcClient, type EngineStaleness} from '@conciv/contract'
import {CHAT_SSE_PATH, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {HarnessCommand, HarnessModel, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'
import type {AlternateHarness} from '@conciv/extension-testkit/core-kit'
import type {PushWireWatch} from '@conciv/extension-testkit/push-wire'

export type BootCoreInput = {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  connect?: boolean
  terminal?: boolean
  history?: HarnessSessionMeta[]
  commands?: HarnessCommand[]
  models?: HarnessModel[]
  alternates?: AlternateHarness[]
  allowedOrigins?: string[]
}

export type BootCoreResult = {base: string; wsBase: string; bootMs: number}

export type FaultSpec =
  | {kind: 'fail'; path: string[]; status?: number}
  | {kind: 'abort'; path?: string[]}
  | {kind: 'gate'; path?: string[]}
  | {kind: 'chat-refused'; status?: number}
  | {kind: 'chat-gate'}

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
  const {bootCoreKit, createTerminalExtension, watchPushWire} = await testkitOf(ctx)
  const kit = await bootCoreKit({
    id: input.id,
    text: input.text,
    resume: input.resume,
    displayName: input.displayName,
    history: input.history,
    commands: input.commands,
    models: input.models,
    alternates: input.alternates,
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

const rpcCallCount: BrowserCommand<[string[]]> = (ctx, path): number => kitOf(ctx).rpcServed(path)

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

type Route = Parameters<Parameters<BrowserCommandContext['page']['route']>[1]>[0]

async function gateChatTurns(ctx: BrowserCommandContext): Promise<Fault> {
  const held: {open: boolean; routes: Route[]; waiters: {count: number; deliver: () => void}[]} = {
    open: false,
    routes: [],
    waiters: [],
  }
  const matcher = (url: URL): boolean => url.pathname.endsWith(CHAT_SSE_PATH)
  const handler = async (route: Route): Promise<void> => {
    if (held.open || route.request().method() !== 'POST') return route.continue()
    held.routes.push(route)
    for (const waiter of held.waiters.filter((entry) => held.routes.length >= entry.count)) waiter.deliver()
  }
  await ctx.page.route(matcher, handler)
  const open = async (): Promise<void> => {
    held.open = true
    await Promise.all(held.routes.splice(0).map((route) => route.continue().catch(() => {})))
  }
  return {
    pending: () => held.routes.length,
    awaitCaptured: (count) =>
      held.routes.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => held.waiters.push({count, deliver: resolve})),
    release: open,
    dispose: async () => {
      await open()
      await ctx.page.unroute(matcher, handler)
    },
  }
}

function pathOptions(path: string[] | undefined): {path?: string[]} {
  return path ? {path} : {}
}

function statusOptions(status: number | undefined): {status?: number} {
  return status ? {status} : {}
}

function brokenRpcCalls(
  testkit: CoreTestkit,
  ctx: BrowserCommandContext,
  spec: Extract<FaultSpec, {kind: 'abort' | 'fail'}>,
): ReturnType<CoreTestkit['abortRpcCalls']> {
  if (spec.kind === 'abort') return testkit.abortRpcCalls(ctx.page, pathOptions(spec.path))
  return testkit.failRpcCalls(ctx.page, {path: spec.path, ...statusOptions(spec.status)})
}

async function createFault(ctx: BrowserCommandContext, handle: string, spec: FaultSpec): Promise<Fault> {
  const testkit = await testkitOf(ctx)
  if (spec.kind === 'gate') return testkit.gateRpcCalls(ctx.page, pathOptions(spec.path))
  if (spec.kind === 'chat-gate') return gateChatTurns(ctx)
  if (spec.kind === 'chat-refused') {
    return trackedFault(handle, spec.kind, await testkit.failChatTurns(ctx.page, statusOptions(spec.status)))
  }
  return trackedFault(handle, spec.kind, await brokenRpcCalls(testkit, ctx, spec))
}

const installFault: BrowserCommand<[FaultSpec]> = async (ctx, spec): Promise<string> => {
  const state = stateOf(ctx)
  state.handles.count += 1
  const handle = `fault-${state.handles.count}`
  state.faults.set(handle, await createFault(ctx, handle, spec))
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
