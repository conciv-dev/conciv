import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {connect as connectSocket, createServer, type Server as TcpServer, type Socket} from 'node:net'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {BrowserCommand, BrowserCommandContext} from 'vitest/node'
import {REVOKED_SOCKET_CLOSE_CODE, type EngineStaleness} from '@conciv/contract'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {CONCIV_VERSION_HEADER, RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {recordHubConnection, removeHubConnection, withHomeDb} from '@conciv/db'
import type {
  HarnessCapabilities,
  HarnessCommand,
  HarnessConnectContext,
  HarnessModel,
} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {revokeBrowsers as revokeTrustedBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {FixtureSession, PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {CoreKit} from './core-testkit.js'
import type {AlternateHarness, EditorOpen} from '@conciv/plugin-testkit/core-kit'
import type {RpcCallCursor} from '@conciv/plugin-testkit/rpc-counts'

export type BootCoreInput = {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  resumeBin?: string
  imageInput?: HarnessCapabilities['imageInput']
  history?: FixtureSession[]
  holdTranscripts?: boolean
  commands?: HarnessCommand[]
  models?: HarnessModel[]
  alternates?: AlternateHarness[]
  allowedOrigins?: string[]
  plugins?: NonNullable<ConcivConfig['plugins']>
  files?: Record<string, string>
  tty?: boolean
}

const TERMINAL_STARTED_FILE = 'terminal-started'
const BUSY_TERMINAL_MODEL = 'busy-model'

function fakeTerminal(context: HarnessConnectContext): TtyCommand {
  const busy =
    context.model === BUSY_TERMINAL_MODEL
      ? `trap 'echo; echo interrupted' INT; printf '\\033]9;4;1\\007'; sleep 600 & wait $!; kill $! 2>/dev/null; trap - INT; printf '\\033]9;4;0\\007'; `
      : ''
  return {
    bin: 'bash',
    args: [
      '-c',
      `echo started >> ${TERMINAL_STARTED_FILE}; echo "model $CLI_MODEL"; export PS1='P> '; ${busy}exec bash --noprofile --norc -i`,
    ],
    env: {TERM: 'xterm-256color', BASH_SILENCE_DEPRECATION_WARNING: '1', CLI_MODEL: context.model ?? 'none'},
  }
}

export type BootCoreResult = {base: string; wsBase: string; origin: string; bootMs: number}

export type PointerMove = {deltaX: number; deltaY: number; steps?: number}

export type PointerDrag = {name: string; moves: PointerMove[]; escape?: boolean; settleMs?: number}

export type PointerHover = {name: string; moves: PointerMove[]; settleMs: number}

export type ChosenFile = {name: string; mimeType: string; text: string}

export type FaultSpec =
  | {kind: 'fail'; path: string[]; status?: number}
  | {kind: 'abort'; path?: string[]}
  | {kind: 'garble'; path: string[]; input?: unknown}
  | {kind: 'gate'; path?: string[]; input?: unknown}
  | {kind: 'chat-refused'; status?: number}
  | {kind: 'offline'}
  | {kind: 'handshake-hold'}
  | {kind: 'late-close'}
  | {kind: 'detached-sockets'}
  | {kind: 'chat-gate'}
  | {kind: 'chat-frame-gate'; onRelease: 'deliver' | 'fail'}
  | {kind: 'project-socket-gate'; socket: string}
  | {kind: 'cut-on-release'; path: string[]; input?: unknown}
  | {kind: 'pre-version-engine'}

type Fault = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
  answered: () => Promise<unknown>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

type CoreTestkit = typeof import('./core-testkit.js')

type HubCliState = {root: string; saved: {PATH: string; HOME: string}} | null

type FileState = {
  kit: CoreKit | null
  staleness: {value: EngineStaleness}
  faults: Map<string, Fault>
  handles: {count: number}
  hubCli: {current: HubCliState}
  rpcCalls: RpcCallCursor | null
  forward: {server: TcpServer; sockets: Set<Socket>} | null
}

const FRESH: EngineStaleness = {
  stale: false,
  changed: [],
  tracked: ['@conciv/core'],
  bootedAt: 0,
  fingerprint: 'testkit0000',
}

const AWAIT_RPC_TIMEOUT_MS = 15_000

const CHAT_EVENTS_PATH: readonly string[] = ['chat', 'events']

const files = new Map<string, FileState>()

function importTestkit(ctx: BrowserCommandContext): Promise<CoreTestkit> {
  const nodeProject = ctx.project.vitest.getRootProject()
  return nodeProject.import<CoreTestkit>(join(ctx.project.config.root, 'test/commands/core-testkit.ts'))
}

function ensureState(ctx: BrowserCommandContext): FileState {
  const key = ctx.testPath ?? 'shared'
  const existing = files.get(key)
  if (existing) return existing
  const created: FileState = {
    kit: null,
    staleness: {value: FRESH},
    faults: new Map(),
    handles: {count: 0},
    hubCli: {current: null},
    rpcCalls: null,
    forward: null,
  }
  files.set(key, created)
  return created
}

function requireKit(ctx: BrowserCommandContext): CoreKit {
  const kit = ensureState(ctx).kit
  if (!kit) throw new Error('no core is booted for this test file; call bootCore first')
  return kit
}

function requireFault(ctx: BrowserCommandContext, handle: string): Fault {
  const fault = ensureState(ctx).faults.get(handle)
  if (!fault) throw new Error(`no fault is installed under the handle "${handle}"`)
  return fault
}

const bootCore: BrowserCommand<[BootCoreInput]> = async (ctx, input): Promise<BootCoreResult> => {
  const state = ensureState(ctx)
  if (state.kit) throw new Error('a core is already booted for this test file; call closeCore first')
  const startedAt = Date.now()
  const {bootCoreKit, rpcSocketFor, rpcCallCursor} = await importTestkit(ctx)
  await rpcSocketFor(ctx.page).installed
  state.rpcCalls = rpcCallCursor(ctx.page)
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
    resumeBin: input.resumeBin,
    imageInput: input.imageInput,
    plugins: input.plugins,
    files: input.files,
    tty: input.tty ? {command: fakeTerminal} : undefined,
  })
  holdTranscriptsWhen(kit, input.holdTranscripts)
  state.kit = kit
  return {base: kit.base, wsBase: kit.wsBase, origin: kit.origin, bootMs: Date.now() - startedAt}
}

function holdTranscriptsWhen(kit: CoreKit, held: boolean | undefined): void {
  if (held) kit.harness.transcripts.hold()
}

function listenOnConnectPort(server: TcpServer, port: number): Promise<number> {
  if (port > CONNECT_LAST_PORT) return Promise.reject(new Error('every connect port is taken'))
  return new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => resolve(true))
  }).then((bound) => (bound ? port : listenOnConnectPort(server, port + 1)))
}

function closeForward(state: FileState): Promise<void> {
  const forward = state.forward
  state.forward = null
  if (!forward) return Promise.resolve()
  forward.sockets.forEach((socket) => socket.destroy())
  return new Promise((resolve) => forward.server.close(() => resolve()))
}

const forwardConnectPort: BrowserCommand<[]> = async (ctx): Promise<number> => {
  const state = ensureState(ctx)
  const kit = state.kit
  if (!kit) throw new Error('no core is booted for this test file; call bootCore first')
  await closeForward(state)
  const target = Number(new URL(kit.base).port)
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    const upstream = connectSocket(target, '127.0.0.1')
    sockets.add(socket).add(upstream)
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
    socket.pipe(upstream).pipe(socket)
  })
  state.forward = {server, sockets}
  return listenOnConnectPort(server, CONNECT_FIRST_PORT)
}

const closeConnectForward: BrowserCommand<[]> = (ctx): Promise<void> => closeForward(ensureState(ctx))

const closeCore: BrowserCommand<[]> = async (ctx): Promise<void> => {
  const state = ensureState(ctx)
  await closeForward(state)
  for (const fault of state.faults.values()) await fault.dispose()
  state.faults.clear()
  state.staleness.value = FRESH
  restoreHubCli(state)
  state.rpcCalls = null
  const kit = state.kit
  state.kit = null
  if (kit) {
    kit.harness.script.release()
    kit.harness.transcripts.release()
    await kit.cleanup()
  }
}

const pagePluginPaths: BrowserCommand<[]> = (): {engine: string; rpc: string} => ({
  engine: fileURLToPath(import.meta.resolve('@conciv/plugin-page')),
  rpc: fileURLToPath(import.meta.resolve('@conciv/plugin-page/rpc')),
})

const writeProjectFile: BrowserCommand<[string, string]> = (ctx, path, content): void => {
  requireKit(ctx).writeProjectFile(path, content)
}

const projectFileExists: BrowserCommand<[string]> = (ctx, path): boolean =>
  existsSync(join(requireKit(ctx).stateRoot, path))

const chatStreamsOpened: BrowserCommand<[]> = (ctx): number => requireCalls(ctx).startedSince(CHAT_EVENTS_PATH)

const rpcSocketsRevoked: BrowserCommand<[]> = async (ctx): Promise<number> =>
  (await importTestkit(ctx)).rpcSocketFor(ctx.page).engineCloses(REVOKED_SOCKET_CLOSE_CODE)

const rpcSocketsOpened: BrowserCommand<[]> = (ctx): number => requireCalls(ctx).socketsSince()

const printedCode: BrowserCommand<[]> = (ctx): string => {
  const code = [
    ...requireKit(ctx)
      .terminal()
      .matchAll(/#conciv_otp=(\d{6})/g),
  ].at(-1)?.[1]
  if (code === undefined) throw new Error('the engine printed no login code')
  return code
}

const requestCode: BrowserCommand<[]> = async (ctx): Promise<string> => {
  const kit = requireKit(ctx)
  const {requestPrintedCode} = await importTestkit(ctx)
  return requestPrintedCode(kit.origin, kit.terminal)
}

const revokeBrowsers: BrowserCommand<[]> = (ctx): number =>
  revokeTrustedBrowsers(concivStateDir(requireKit(ctx).stateRoot), 'all').length

const setHubConnection: BrowserCommand<[string, boolean]> = (ctx, harness, connected): void => {
  withHomeDb(requireKit(ctx).home, (db) =>
    connected ? recordHubConnection(db, harness, Date.now()) : removeHubConnection(db, harness),
  )
}

const hubExecute: BrowserCommand<[string, string, string?]> = async (
  ctx,
  sessionId,
  typescriptCode,
  origin = 'hub',
): Promise<string> => {
  const headers = {[CONCIV_SESSION_HEADER]: sessionId, [CONCIV_ORIGIN_HEADER]: origin, [CONCIV_CLIENT_HEADER]: 'codex'}
  withHomeDb(requireKit(ctx).home, (db) => recordHubConnection(db, 'codex', Date.now()))
  const {connectMcpClient} = await importTestkit(ctx)
  const client = await connectMcpClient(`${requireKit(ctx).base}/api/mcp`, headers)
  try {
    const execute = (await client.tools()).find((tool) => tool.name === 'execute_typescript')
    if (execute === undefined) throw new Error('the engine served no execute_typescript tool')
    return JSON.stringify(await execute.execute({typescriptCode}).catch((error: unknown) => String(error)))
  } finally {
    await client.close()
  }
}

const setStaleness: BrowserCommand<[EngineStaleness]> = (ctx, value): void => {
  ensureState(ctx).staleness.value = value
}

const holdTurn: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.hold()
}

const releaseTurn: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.release()
}

const releaseTranscripts: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.transcripts.release()
}

const holdTools: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.holdTools()
}

const releaseTools: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.releaseTools()
}

const holdResults: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.holdResults()
}

const releaseResults: BrowserCommand<[PacedRelease?]> = (ctx, paced): void => {
  requireKit(ctx).harness.script.releaseResults(paced)
}

const scriptTurn: BrowserCommand<[ScriptedTurn]> = (ctx, turn): string[] =>
  requireKit(ctx).harness.script.scriptTurn(turn)

const scriptError: BrowserCommand<[string]> = (ctx, message): void => {
  requireKit(ctx).harness.script.scriptError(message)
}

const clearScript: BrowserCommand<[]> = (ctx): void => {
  requireKit(ctx).harness.script.clearScript()
}

const scriptCustomEvent: BrowserCommand<[string, unknown]> = (ctx, name, value): void => {
  requireKit(ctx).harness.script.scriptCustomEvent(name, value)
}

type HubCliHold = 'fail' | 'hold' | 'hold-remove'

const HUB_CLI_MARKERS: Record<HubCliHold, string> = {fail: 'fail', hold: 'gate', 'hold-remove': 'gate-remove'}

const fakeHubCli: BrowserCommand<['ok' | HubCliHold | null]> = (ctx, outcome): void => {
  const state = ensureState(ctx)
  if (outcome === null) return restoreHubCli(state)
  const root = hubCliRoot(state)
  for (const marker of Object.values(HUB_CLI_MARKERS)) rmSync(join(root, marker), {force: true})
  if (outcome !== 'ok') writeFileSync(join(root, HUB_CLI_MARKERS[outcome]), '')
  Object.assign(process.env, {PATH: join(root, 'bin'), HOME: join(root, 'home')})
}

function hubCliRoot(state: FileState): string {
  const current = state.hubCli.current ?? freshHubCli()
  state.hubCli.current = current
  mkdirSync(join(current.root, 'bin'), {recursive: true})
  mkdirSync(join(current.root, 'home'), {recursive: true})
  if (existsSync(join(current.root, 'bin', 'claude'))) return current.root
  const lines = [
    '#!/bin/sh',
    `while [ -f '${join(current.root, 'gate')}' ]; do /bin/sleep 0.05; done`,
    `case "$*" in *remove*) while [ -f '${join(current.root, 'gate-remove')}' ]; do /bin/sleep 0.05; done ;; esac`,
    `if [ -f '${join(current.root, 'fail')}' ]; then echo "\${0##*/}: could not add conciv-hub" >&2; exit 2; fi`,
    'exit 0',
  ]
  for (const agent of ['claude', 'opencode']) {
    writeFileSync(join(current.root, 'bin', agent), `${lines.join('\n')}\n`, {mode: 0o755})
  }
  return current.root
}

function freshHubCli(): NonNullable<HubCliState> {
  return {
    root: mkdtempSync(join(runHome(), 'hub-cli-')),
    saved: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? ''},
  }
}

function runHome(): string {
  const home = process.env.CONCIV_HOME
  if (home === undefined)
    throw new Error('the conciv-home globalSetup that ciTest() carries sets CONCIV_HOME for the run')
  return home
}

function restoreHubCli(state: FileState): void {
  const current = state.hubCli.current
  if (current === null) return
  state.hubCli.current = null
  Object.assign(process.env, current.saved)
  rmSync(current.root, {recursive: true, force: true})
}

const rpcCallCount: BrowserCommand<[string[], unknown?]> = (ctx, path, input): number =>
  requireCalls(ctx).servedSince(path, input)

const rpcStartedOnceServed: BrowserCommand<[string[], number, string[][], unknown?]> = async (
  ctx,
  served,
  count,
  started,
  input,
): Promise<number[]> => {
  const calls = requireCalls(ctx)
  const {rpcObserverFor} = await importTestkit(ctx)
  const observer = rpcObserverFor(ctx.page)
  const settle = async (): Promise<void> => {
    if (calls.servedSince(served, input) >= count) return
    await observer.completed({path: served, input, served: true, since: observer.mark(), timeout: AWAIT_RPC_TIMEOUT_MS})
    await settle()
  }
  await settle()
  return started.map((path) => calls.startedSince(path))
}

const rpcMark: BrowserCommand<[]> = async (ctx): Promise<number> => {
  const {rpcObserverFor} = await importTestkit(ctx)
  return rpcObserverFor(ctx.page).mark()
}

const awaitRpcFailedCount: BrowserCommand<[string[], number, number, number]> = async (
  ctx,
  path,
  status,
  count,
  since,
): Promise<void> => {
  const {rpcObserverFor} = await importTestkit(ctx)
  const observer = rpcObserverFor(ctx.page)
  const settle = async (): Promise<void> => {
    const next = observer.mark()
    if (observer.completedCount({path, status, since}) >= count) return
    await observer.completed({path, status, since: next, timeout: AWAIT_RPC_TIMEOUT_MS})
    await settle()
  }
  await settle()
}

function requireCalls(ctx: BrowserCommandContext): RpcCallCursor {
  const calls = ensureState(ctx).rpcCalls
  if (!calls) throw new Error('no core is booted for this test file; call bootCore first')
  return calls
}

type Injector = {repair: () => void; dispose: () => Promise<void>; answered?: () => Promise<unknown>}

function trackedFault(handle: string, kind: FaultSpec['kind'], injector: Injector): Fault {
  return {
    pending: () => 0,
    awaitCaptured: () =>
      Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which never captures pending requests`)),
    answered:
      injector.answered ??
      (() => Promise.reject(new Error(`the fault "${handle}" is a ${kind} fault, which has no single call to await`))),
    release: () => {
      injector.repair()
      return Promise.resolve()
    },
    dispose: injector.dispose,
  }
}

async function takeEngineOffline(ctx: BrowserCommandContext): Promise<Injector> {
  const origin = requireKit(ctx).origin
  const offline = {value: true}
  const rpcSocket = (await importTestkit(ctx)).rpcSocketFor(ctx.page)
  const matcher = (url: URL): boolean => url.origin === origin
  await ctx.page.route(matcher, (route) => (offline.value ? route.abort('connectionrefused') : route.continue()))
  await rpcSocket.hold()
  return {
    repair: () => {
      offline.value = false
      rpcSocket.release()
    },
    dispose: () => {
      rpcSocket.release()
      return ctx.page.unroute(matcher)
    },
  }
}

async function holdEngineHandshakes(ctx: BrowserCommandContext): Promise<Fault> {
  const rpcSocket = (await importTestkit(ctx)).rpcSocketFor(ctx.page)
  await rpcSocket.installed
  rpcSocket.holdHandshakes()
  return {
    pending: rpcSocket.heldHandshakes,
    awaitCaptured: rpcSocket.awaitHandshakes,
    answered: () => Promise.reject(new Error('a held handshake fault has no single call to await')),
    release: () => {
      rpcSocket.releaseHandshakes()
      return Promise.resolve()
    },
    dispose: () => {
      rpcSocket.releaseHandshakes()
      return Promise.resolve()
    },
  }
}

async function holdEngineCloses(ctx: BrowserCommandContext): Promise<Injector> {
  const rpcSocket = (await importTestkit(ctx)).rpcSocketFor(ctx.page)
  await rpcSocket.installed
  rpcSocket.holdCloses()
  return {
    repair: rpcSocket.releaseCloses,
    dispose: () => {
      rpcSocket.releaseCloses()
      return Promise.resolve()
    },
  }
}

async function preVersionEngine(ctx: BrowserCommandContext): Promise<Injector> {
  const origin = requireKit(ctx).origin
  const matcher = (url: URL): boolean => url.origin === origin
  const handler = async (route: Route): Promise<void> => {
    if ((await route.request().headerValue(CONCIV_VERSION_HEADER)) !== null) return route.abort('failed')
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
  const host = new URL(requireKit(ctx).origin).host
  const detached = {value: true}
  await ctx.page.routeWebSocket(
    (url) => url.host === host && !url.pathname.endsWith(RPC_WS_PATH),
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

const CHAT_SEND_PATH = ['chat', 'send']

async function gateChatSends(ctx: BrowserCommandContext, onRelease: 'deliver' | 'fail'): Promise<Fault> {
  const testkit = await importTestkit(ctx)
  return testkit.gateRpcCalls(ctx.page, {path: CHAT_SEND_PATH, onRelease: onRelease === 'deliver' ? 'forward' : 'fail'})
}

const UNIX_SOCKET_PATH_LIMIT = 103

async function gateProjectSocket(root: string, name: string): Promise<Fault> {
  const path = join(root, name)
  const bytes = Buffer.byteLength(path)
  if (bytes > UNIX_SOCKET_PATH_LIMIT) {
    throw new Error(
      `the project socket gate's path is ${bytes} bytes, over the ${UNIX_SOCKET_PATH_LIMIT} a unix socket allows: ${path}`,
    )
  }
  const held: {open: boolean; sockets: Socket[]; waiters: {count: number; deliver: () => void}[]} = {
    open: false,
    sockets: [],
    waiters: [],
  }
  const resumed = Promise.withResolvers<void>()
  const server = createServer((socket) => {
    socket.on('error', () => socket.destroy())
    socket.on('close', () => resumed.resolve())
    if (held.open) return socket.write('release')
    held.sockets.push(socket)
    for (const waiter of held.waiters.filter((entry) => held.sockets.length >= entry.count)) waiter.deliver()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  const open = (): Promise<void> => {
    held.open = true
    for (const socket of held.sockets.splice(0)) socket.write('release')
    return Promise.resolve()
  }
  return {
    pending: () => held.sockets.length,
    awaitCaptured: (count) =>
      held.sockets.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => held.waiters.push({count, deliver: resolve})),
    answered: () => resumed.promise,
    release: open,
    dispose: async () => {
      await open()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

async function cutOnRelease(ctx: BrowserCommandContext, path: string[], input: unknown): Promise<Fault> {
  return (await importTestkit(ctx)).gateRpcCalls(ctx.page, {path, input, onRelease: 'cut'})
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
  spec: Extract<FaultSpec, {kind: 'abort' | 'fail' | 'garble'}>,
): ReturnType<CoreTestkit['abortRpcCalls']> {
  if (spec.kind === 'abort') return testkit.abortRpcCalls(ctx.page, pathOptions(spec.path))
  if (spec.kind === 'garble') return testkit.garbleRpcReplies(ctx.page, {path: spec.path, input: spec.input})
  return testkit.failRpcCalls(ctx.page, {path: spec.path, ...statusOptions(spec.status)})
}

async function createFault(ctx: BrowserCommandContext, handle: string, spec: FaultSpec): Promise<Fault> {
  const testkit = await importTestkit(ctx)
  if (spec.kind === 'gate') return testkit.gateRpcCalls(ctx.page, {...pathOptions(spec.path), input: spec.input})
  if (spec.kind === 'chat-gate') return gateChatSends(ctx, 'deliver')
  if (spec.kind === 'chat-frame-gate') return gateChatSends(ctx, spec.onRelease)
  if (spec.kind === 'project-socket-gate') return gateProjectSocket(requireKit(ctx).stateRoot, spec.socket)
  if (spec.kind === 'cut-on-release') return cutOnRelease(ctx, spec.path, spec.input)
  if (spec.kind === 'detached-sockets') return trackedFault(handle, spec.kind, await detachEngineSockets(ctx))
  if (spec.kind === 'handshake-hold') return holdEngineHandshakes(ctx)
  if (spec.kind === 'offline') return trackedFault(handle, spec.kind, await takeEngineOffline(ctx))
  if (spec.kind === 'late-close') return trackedFault(handle, spec.kind, await holdEngineCloses(ctx))
  if (spec.kind === 'pre-version-engine') return trackedFault(handle, spec.kind, await preVersionEngine(ctx))
  if (spec.kind === 'chat-refused') {
    return trackedFault(handle, spec.kind, await testkit.failChatTurns(ctx.page, statusOptions(spec.status)))
  }
  return trackedFault(handle, spec.kind, await brokenRpcCalls(testkit, ctx, spec))
}

const installFault: BrowserCommand<[FaultSpec]> = async (ctx, spec): Promise<string> => {
  const state = ensureState(ctx)
  state.handles.count += 1
  const handle = `fault-${state.handles.count}`
  state.faults.set(handle, await createFault(ctx, handle, spec))
  return handle
}

const releaseFault: BrowserCommand<[string]> = async (ctx, handle): Promise<void> => {
  await requireFault(ctx, handle).release()
}

const awaitFaultAnswered: BrowserCommand<[string]> = (ctx, handle): Promise<unknown> =>
  requireFault(ctx, handle).answered()

const faultPending: BrowserCommand<[string]> = (ctx, handle): number => requireFault(ctx, handle).pending()

async function withinDeadline(waiting: Promise<void>, timeoutMs: number, missed: () => string): Promise<void> {
  const timer: {value: ReturnType<typeof setTimeout> | null} = {value: null}
  const deadline = new Promise<never>((_, reject) => {
    timer.value = setTimeout(() => reject(new Error(missed())), timeoutMs)
  })
  try {
    await Promise.race([waiting, deadline])
  } finally {
    if (timer.value) clearTimeout(timer.value)
  }
}

const awaitFaultPending: BrowserCommand<[string, number, number?]> = (
  ctx,
  handle,
  count,
  timeoutMs = AWAIT_RPC_TIMEOUT_MS,
): Promise<void> =>
  withinDeadline(
    requireFault(ctx, handle).awaitCaptured(count),
    timeoutMs,
    () =>
      `the fault "${handle}" captured ${requireFault(ctx, handle).pending()} of ${count} pending requests within ${timeoutMs}ms`,
  )

const awaitRpcSocketLive: BrowserCommand<[]> = async (ctx): Promise<void> =>
  withinDeadline(
    (await importTestkit(ctx)).rpcSocketFor(ctx.page).awaitLive(),
    AWAIT_RPC_TIMEOUT_MS,
    () => `no rpc socket was live within ${AWAIT_RPC_TIMEOUT_MS}ms`,
  )

const awaitRpcSocketsRevoked: BrowserCommand<[number]> = async (ctx, count): Promise<void> =>
  withinDeadline(
    (await importTestkit(ctx)).rpcSocketFor(ctx.page).awaitEngineCloses(REVOKED_SOCKET_CLOSE_CODE, count),
    AWAIT_RPC_TIMEOUT_MS,
    () => `the engine did not close ${count} rpc sockets as revoked within ${AWAIT_RPC_TIMEOUT_MS}ms`,
  )

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

const chooseFiles: BrowserCommand<[name: string, chosen: ChosenFile[]]> = async (ctx, name, chosen) => {
  const chooser = ctx.page.waitForEvent('filechooser')
  await ctx.iframe.getByRole('button', {name, exact: true}).click()
  await (
    await chooser
  ).setFiles(chosen.map((file) => ({name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.text)})))
}

const downloadFrom: BrowserCommand<[name: string]> = async (ctx, name): Promise<{name: string; text: string}> => {
  const download = ctx.page.waitForEvent('download')
  await ctx.iframe.getByRole('button', {name, exact: true}).click()
  const saved = await download
  const path = await saved.path()
  return {name: saved.suggestedFilename(), text: readFileSync(path, 'utf8')}
}

const editorOpened: BrowserCommand<[]> = (ctx): ReadonlyArray<EditorOpen> => requireKit(ctx).editorOpened()

const openedFrom: BrowserCommand<[name: string]> = async (ctx, name): Promise<string> => {
  const opened = ctx.page.context().waitForEvent('page')
  await ctx.iframe.getByRole('button', {name, exact: true}).click()
  const tab = await opened
  await tab.waitForLoadState('domcontentloaded')
  const url = tab.url()
  await tab.close()
  return url
}

const newerDraftTabs = new WeakMap<BrowserCommandContext['page'], BrowserCommandContext['page']>()

const openNewerDraftTab: BrowserCommand<[version: number]> = async (ctx, version) => {
  const tab = await ctx.page.context().newPage()
  newerDraftTabs.set(ctx.page, tab)
  await tab.goto(new URL('/conciv-newer-tab', ctx.page.url()).href, {waitUntil: 'domcontentloaded'})
  await tab.evaluate(
    (wanted) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('conciv-drafts', wanted)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(request.error))
      }),
    version,
  )
}

const closeNewerDraftTab: BrowserCommand<[]> = async (ctx) => {
  await newerDraftTabs.get(ctx.page)?.close()
  newerDraftTabs.delete(ctx.page)
}

export const coreCommands = {
  chooseFiles,
  openNewerDraftTab,
  closeNewerDraftTab,
  editorOpened,
  openedFrom,
  downloadFrom,
  dragButton,
  hoverButton,
  bootCore,
  closeCore,
  forwardConnectPort,
  closeConnectForward,
  pagePluginPaths,
  writeProjectFile,
  projectFileExists,
  chatStreamsOpened,
  rpcSocketsRevoked,
  awaitRpcSocketsRevoked,
  awaitRpcSocketLive,
  rpcSocketsOpened,
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
  setHubConnection,
  rpcCallCount,
  rpcStartedOnceServed,
  rpcMark,
  awaitRpcFailedCount,
  installFault,
  releaseFault,
  faultPending,
  awaitFaultPending,
  awaitFaultAnswered,
}
