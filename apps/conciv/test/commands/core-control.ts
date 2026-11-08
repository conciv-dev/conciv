import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import type {EngineStaleness} from '@conciv/contract'
import {
  CHAT_SSE_PATH,
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
} from '@conciv/protocol/chat-types'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import type {HarnessCommand, HarnessModel} from '@conciv/protocol/harness-types'
import {revokeBrowsers as revokeTrustedBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {FixtureSession, PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'
import type {AlternateHarness} from '@conciv/extension-testkit/core-kit'
import type {PushWireWatch} from '@conciv/extension-testkit/push-wire'

export type BootCoreInput = {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  connect?: boolean
  history?: FixtureSession[]
  holdTranscripts?: boolean
  commands?: HarnessCommand[]
  models?: HarnessModel[]
  alternates?: AlternateHarness[]
  allowedOrigins?: string[]
}

export type BootCoreResult = {base: string; wsBase: string; origin: string; bootMs: number}

export type PointerMove = {deltaX: number; deltaY: number; steps?: number}

export type PointerDrag = {name: string; moves: PointerMove[]; escape?: boolean; settleMs?: number}

export type PointerHover = {name: string; moves: PointerMove[]; settleMs: number}

export type FaultSpec =
  | {kind: 'fail'; path: string[]; status?: number}
  | {kind: 'abort'; path?: string[]}
  | {kind: 'gate'; path?: string[]}
  | {kind: 'chat-refused'; status?: number}
  | {kind: 'offline'}
  | {kind: 'detached-sockets'}
  | {kind: 'chat-gate'}
  | {kind: 'cut-on-release'; path: string[]}
  | {kind: 'pre-version-engine'}

type Fault = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
  answered: () => Promise<void>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

type CoreTestkit = typeof import('./core-testkit.js')

type HubCliState = {root: string; saved: {PATH: string; HOME: string; CONCIV_HOME: string}} | null

type FileState = {
  kit: CoreKit | null
  staleness: {value: EngineStaleness}
  faults: Map<string, Fault>
  handles: {count: number}
  hubCli: {current: HubCliState}
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
    hubCli: {current: null},
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
  const {bootCoreKit, watchPushWire} = await testkitOf(ctx)
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
    ...(input.connect
      ? {
          tty: {
            command: (context) => ({bin: 'claude', args: ['--resume', context.harnessSessionId ?? 'new'], env: {}}),
          },
        }
      : {}),
  })
  holdTranscriptsWhen(kit, input.holdTranscripts)
  state.kit = kit
  state.push = watchPushWire(ctx.page)
  return {base: kit.base, wsBase: kit.wsBase, origin: kit.origin, bootMs: Date.now() - startedAt}
}

function holdTranscriptsWhen(kit: CoreKit, held: boolean | undefined): void {
  if (held) kit.harness.transcripts.hold()
}

const closeCore: BrowserCommand<[]> = async (ctx): Promise<void> => {
  const state = stateOf(ctx)
  for (const fault of state.faults.values()) await fault.dispose()
  state.faults.clear()
  state.staleness.value = FRESH
  restoreHubCli(state)
  state.push = null
  const kit = state.kit
  state.kit = null
  if (!kit) return
  kit.harness.script.release()
  kit.harness.transcripts.release()
  await kit.cleanup()
}

const pushSocketsOpened: BrowserCommand<[]> = (ctx): number => pushOf(ctx).opened()

const pushSocketsLive: BrowserCommand<[]> = (ctx): number => pushOf(ctx).liveSockets()

const printedCode: BrowserCommand<[]> = (ctx): string => {
  const code = [
    ...kitOf(ctx)
      .terminal()
      .matchAll(/#conciv_otp=(\d{6})/g),
  ].at(-1)?.[1]
  if (code === undefined) throw new Error('the engine printed no login code')
  return code
}

const requestCode: BrowserCommand<[]> = async (ctx): Promise<string> => {
  const kit = kitOf(ctx)
  const {requestPrintedCode} = await testkitOf(ctx)
  return requestPrintedCode(kit.origin, kit.terminal)
}

const revokeBrowsers: BrowserCommand<[]> = (ctx): number =>
  revokeTrustedBrowsers(concivStateDir(kitOf(ctx).stateRoot), 'all').length

const hubExecute: BrowserCommand<[string, string, string?]> = async (
  ctx,
  sessionId,
  typescriptCode,
  origin = 'hub',
): Promise<string> => {
  const headers = {[CONCIV_SESSION_HEADER]: sessionId, [CONCIV_ORIGIN_HEADER]: origin, [CONCIV_CLIENT_HEADER]: 'codex'}
  const {connectMcpClient} = await testkitOf(ctx)
  const client = await connectMcpClient(`${kitOf(ctx).base}/api/mcp`, headers)
  try {
    const execute = (await client.tools()).find((tool) => tool.name === 'execute_typescript')
    if (execute === undefined) throw new Error('the engine served no execute_typescript tool')
    return JSON.stringify(await execute.execute({typescriptCode}).catch((error: unknown) => String(error)))
  } finally {
    await client.close()
  }
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

const releaseTranscripts: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.transcripts.release()
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

const scriptError: BrowserCommand<[string]> = (ctx, message): void => {
  kitOf(ctx).harness.script.scriptError(message)
}

const clearScript: BrowserCommand<[]> = (ctx): void => {
  kitOf(ctx).harness.script.clearScript()
}

const scriptCustomEvent: BrowserCommand<[string, unknown]> = (ctx, name, value): void => {
  kitOf(ctx).harness.script.scriptCustomEvent(name, value)
}

const fakeHubCli: BrowserCommand<['ok' | 'fail' | null]> = (ctx, outcome): void => {
  const state = stateOf(ctx)
  if (outcome === null) return restoreHubCli(state)
  const current = state.hubCli.current ?? {
    root: mkdtempSync(join(tmpdir(), 'conciv-hub-cli-')),
    saved: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', CONCIV_HOME: process.env.CONCIV_HOME ?? ''},
  }
  state.hubCli.current = current
  mkdirSync(join(current.root, 'bin'), {recursive: true})
  mkdirSync(join(current.root, 'home'), {recursive: true})
  const exit = outcome === 'ok' ? 'exit 0' : 'echo "claude: could not add conciv-hub" >&2; exit 2'
  writeFileSync(join(current.root, 'bin', 'claude'), `#!/bin/sh\n${exit}\n`, {mode: 0o755})
  Object.assign(process.env, {
    PATH: join(current.root, 'bin'),
    HOME: join(current.root, 'home'),
    CONCIV_HOME: join(current.root, 'conciv'),
  })
}

function restoreHubCli(state: FileState): void {
  const current = state.hubCli.current
  if (current === null) return
  state.hubCli.current = null
  Object.assign(process.env, current.saved)
  rmSync(current.root, {recursive: true, force: true})
}

const rpcCallCount: BrowserCommand<[string[]]> = (ctx, path): number => kitOf(ctx).rpcServed(path)

type Injector = {repair: () => void; dispose: () => Promise<void>}

function trackedFault(handle: string, kind: FaultSpec['kind'], injector: Injector): Fault {
  return {
    pending: () => 0,
    awaitCaptured: () =>
      Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which never captures pending requests`)),
    answered: () =>
      Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which has no single call to await`)),
    release: () => {
      injector.repair()
      return Promise.resolve()
    },
    dispose: injector.dispose,
  }
}

async function takeEngineOffline(ctx: BrowserCommandContext): Promise<Injector> {
  const origin = kitOf(ctx).origin
  const offline = {value: true}
  const matcher = (url: URL): boolean => url.origin === origin
  await ctx.page.route(matcher, (route) => (offline.value ? route.abort('connectionrefused') : route.continue()))
  return {
    repair: () => {
      offline.value = false
    },
    dispose: () => ctx.page.unroute(matcher),
  }
}

async function preVersionEngine(ctx: BrowserCommandContext): Promise<Injector> {
  const origin = kitOf(ctx).origin
  const matcher = (url: URL): boolean => url.origin === origin
  const handler = async (route: Route): Promise<void> => {
    if ((await route.request().headerValue(CONCIV_VERSION_HEADER)) !== null) return route.abort('failed')
    if (new URL(route.request().url()).pathname.endsWith(CHAT_SSE_PATH)) return route.continue()
    const response = await route.fetch()
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(([name]) => name !== CONCIV_VERSION_HEADER),
    )
    return route.fulfill({response, headers})
  }
  await ctx.page.route(matcher, handler)
  return {repair: () => {}, dispose: () => ctx.page.unroute(matcher, handler)}
}

async function detachEngineSockets(ctx: BrowserCommandContext): Promise<Injector> {
  const host = new URL(kitOf(ctx).origin).host
  const detached = {value: true}
  await ctx.page.routeWebSocket(
    (url) => url.host === host,
    (socket) => {
      if (!detached.value) socket.connectToServer()
    },
  )
  return {
    repair: () => {
      detached.value = false
    },
    dispose: () => {
      detached.value = false
      return Promise.resolve()
    },
  }
}

type Route = Parameters<Parameters<BrowserCommandContext['page']['route']>[1]>[0]

async function holdPosts(
  ctx: BrowserCommandContext,
  matcher: (url: URL) => boolean,
  settle: (route: Route) => Promise<void>,
): Promise<Fault> {
  const held: {open: boolean; routes: Route[]; waiters: {count: number; deliver: () => void}[]} = {
    open: false,
    routes: [],
    waiters: [],
  }
  const handler = async (route: Route): Promise<void> => {
    if (held.open || route.request().method() !== 'POST') return route.continue()
    held.routes.push(route)
    for (const waiter of held.waiters.filter((entry) => held.routes.length >= entry.count)) waiter.deliver()
  }
  await ctx.page.route(matcher, handler)
  const open = async (): Promise<void> => {
    held.open = true
    await Promise.all(held.routes.splice(0).map((route) => settle(route).catch(ignoreHandledRoute)))
  }
  return {
    pending: () => held.routes.length,
    awaitCaptured: (count) =>
      held.routes.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => held.waiters.push({count, deliver: resolve})),
    answered: () => Promise.reject(new Error('a held request fault has no single call to await')),
    release: open,
    dispose: async () => {
      await open()
      await ctx.page.unroute(matcher, handler)
    },
  }
}

function ignoreHandledRoute(error: unknown): void {
  if (error instanceof Error && error.message.includes('Route is already handled')) return
  throw error
}

function gateChatTurns(ctx: BrowserCommandContext): Promise<Fault> {
  return holdPosts(
    ctx,
    (url) => url.pathname.endsWith(CHAT_SSE_PATH),
    (route) => route.continue(),
  )
}

function cutOnRelease(ctx: BrowserCommandContext, path: string[]): Promise<Fault> {
  const httpPath = `/rpc/${path.join('/')}`
  return holdPosts(
    ctx,
    (url) => url.pathname.endsWith(httpPath),
    (route) => route.abort('aborted'),
  )
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
  if (spec.kind === 'cut-on-release') return cutOnRelease(ctx, spec.path)
  if (spec.kind === 'detached-sockets') return trackedFault(handle, spec.kind, await detachEngineSockets(ctx))
  if (spec.kind === 'offline') return trackedFault(handle, spec.kind, await takeEngineOffline(ctx))
  if (spec.kind === 'pre-version-engine') return trackedFault(handle, spec.kind, await preVersionEngine(ctx))
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

const awaitFaultAnswered: BrowserCommand<[string]> = async (ctx, handle): Promise<void> => {
  await faultOf(ctx, handle).answered()
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

const buttonBox = async (ctx: BrowserCommandContext, name: string) => {
  const box = await ctx.iframe.getByRole('button', {name, exact: true}).boundingBox()
  if (!box) throw new Error(`no button named ${name} to point at`)
  return box
}

const walkPointer = (ctx: BrowserCommandContext, start: {x: number; y: number}, moves: PointerMove[]) =>
  moves.reduce(async (previous: Promise<{x: number; y: number}>, move) => {
    const at = await previous
    const next = {x: at.x + move.deltaX, y: at.y + move.deltaY}
    await ctx.page.mouse.move(next.x, next.y, {steps: move.steps ?? 1})
    return next
  }, Promise.resolve(start))

const dragButton: BrowserCommand<[drag: PointerDrag]> = async (ctx, drag) => {
  const box = await buttonBox(ctx, drag.name)
  const start = {x: box.x + box.width / 2, y: box.y + box.height / 2}
  await ctx.page.mouse.move(start.x, start.y)
  await ctx.page.mouse.down()
  await walkPointer(ctx, start, drag.moves)
  if (drag.escape) await ctx.page.keyboard.press('Escape')
  if (drag.settleMs) await ctx.page.waitForTimeout(drag.settleMs)
  await ctx.page.mouse.up()
}

const hoverButton: BrowserCommand<[hover: PointerHover]> = async (ctx, hover) => {
  const box = await buttonBox(ctx, hover.name)
  const start = {x: box.x + box.height / 2, y: box.y + box.height / 2}
  await ctx.page.mouse.move(start.x, start.y)
  await ctx.page.waitForTimeout(hover.settleMs)
  await walkPointer(ctx, start, hover.moves)
  await ctx.page.waitForTimeout(hover.settleMs)
}

export const coreCommands = {
  dragButton,
  hoverButton,
  bootCore,
  closeCore,
  pushSocketsOpened,
  pushSocketsLive,
  printedCode,
  requestCode,
  revokeBrowsers,
  hubExecute,
  setStaleness,
  holdTurn,
  holdTools,
  releaseTools,
  holdResults,
  releaseResults,
  releaseTurn,
  releaseTranscripts,
  scriptTurn,
  scriptError,
  clearScript,
  scriptCustomEvent,
  fakeHubCli,
  rpcCallCount,
  installFault,
  releaseFault,
  faultPending,
  awaitFaultPending,
  awaitFaultAnswered,
}
