import {commands, page, userEvent} from 'vitest/browser'
import {
  type EngineStaleness,
  type BrowserRpcClient,
  type PersistedAttachment,
  type RpcClient,
  makeBrowserRpcClient,
  type EngineTokenSource,
} from '@conciv/contract'
import type {PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {BootCoreInput, BootCoreResult, FaultSpec, PointerDrag, PointerHover} from './commands/core-control.js'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {fetchServerSentEvents} from '@conciv/ai/client'
import {CHAT_HISTORY_PAGE_SIZE, CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import {QueryClient, QueryClientProvider, type ChatTransportPreference} from '@conciv/client'
import {type AppContextValue, AppContext} from '../src/app/context.js'
import {makeLiveSessions} from '../src/app/live-sessions.js'
import {createWarmSession} from '../src/app/warm-session.js'
import {makeAppData, type AppData} from '../src/data/app-data.js'
import {parseConcivSettings} from '../src/data/settings.js'
import {createPreferences} from '../src/settings/create-preferences.js'
import {createClientSettings} from '@conciv/extension'
import {makeLayerStack} from '../src/shell/dialogs.js'
import type {ExtensionInstance} from '../src/extension/extension-slots.js'
import {createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import '../src/lib/api-base.js'
import {HostApiProvider} from '@conciv/extension/host'
import {Dialog} from '@conciv/ui-kit-system'
import {EngineReachabilityContext, makeEngineReachability} from '../src/app/reachability.js'
import type {AnyExtension} from '@conciv/extension'
import type {Grab, GrabProvider} from '@conciv/grab'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../src/app/pane-context.js'
import {createInstances} from '../src/extension/create-instances.js'
import {makeGrabStaging} from '../src/pane/grab-staging.js'
import {makeRefreshCoordinator} from '../src/pane/refresh-coordinator.js'
import {NoticeContextProvider, NoticeSurface} from '../src/shell/notice-context.js'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'
import {createEngineLogin, engineConnected, startEngineLogin} from '../src/app/engine-login.js'
import {afterAll, afterEach, beforeAll, expect} from 'vitest'
import {VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'
import {ChatPane} from '../src/pane/chat-pane.js'
import {GRAB_FILE_NAME, GRAB_MIME, grabToPayload} from '@conciv/grab/grab-attachment'
import type {WebStorage} from '@conciv/storage-history'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    bootCore: (input: BootCoreInput) => Promise<BootCoreResult>
    dragButton: (drag: PointerDrag) => Promise<void>
    hoverButton: (hover: PointerHover) => Promise<void>
    closeCore: () => Promise<void>
    pushSocketsOpened: () => Promise<number>
    pushSocketsLive: () => Promise<number>
    printedCode: () => Promise<string>
    requestCode: () => Promise<string>
    revokeBrowsers: () => Promise<number>
    hubExecute: (sessionId: string, typescriptCode: string, origin?: string) => Promise<string>
    setStaleness: (value: EngineStaleness) => Promise<void>
    holdTurn: () => Promise<void>
    holdTools: () => Promise<void>
    releaseTools: () => Promise<void>
    holdResults: () => Promise<void>
    releaseResults: (paced?: PacedRelease) => Promise<void>
    releaseTurn: () => Promise<void>
    releaseTranscripts: () => Promise<void>
    scriptTurn: (turn: ScriptedTurn) => Promise<string[]>
    scriptError: (message: string) => Promise<void>
    clearScript: () => Promise<void>
    scriptCustomEvent: (name: string, value: unknown) => Promise<void>
    fakeHubCli: (outcome: 'ok' | 'fail' | 'hold' | 'hold-remove' | null) => Promise<void>
    setHubConnection: (harness: string, connected: boolean) => Promise<void>
    rpcCallCount: (path: string[]) => Promise<number>
    rpcStartedOnceServed: (served: string[], count: number, started: string[][]) => Promise<number[]>
    installFault: (spec: FaultSpec) => Promise<string>
    releaseFault: (handle: string) => Promise<void>
    faultPending: (handle: string) => Promise<number>
    awaitFaultPending: (handle: string, count: number) => Promise<void>
    awaitFaultAnswered: (handle: string) => Promise<void>
  }
}

export const coreControl = commands

type SeededDraft = {text?: string; attachments?: PersistedAttachment[]}

type TurnHandle = {awaitTurnEnd: () => Promise<void>; awaitReply: () => Promise<void>; close: () => void}

export function coreRpc(base: string): RpcClient {
  return makeBrowserRpcClient(base).rpc
}

export async function createSession(rpc: RpcClient): Promise<string> {
  const {sessionId} = await rpc.sessions.create()
  return sessionId
}

export async function seedDraft(rpc: RpcClient, sessionId: string, draft: SeededDraft): Promise<void> {
  const text = draft.text ?? ''
  await rpc.drafts.set({
    sessionId,
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
    attachments: draft.attachments ?? [],
  })
}

function isFinal(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) return false
  return chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR
}

function isStart(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) return false
  return chunk.type === ChatEventType.RUN_STARTED
}

function isReplyText(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) return false
  return chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT
}

function turnStream(base: string, sessionId: string, text: string, signal: AbortSignal): AsyncIterable<ChatEvent> {
  return fetchServerSentEvents(`${base}${CHAT_SSE_PATH}`).connect(
    [{id: crypto.randomUUID(), role: 'user', parts: [{type: 'text', content: text}]}],
    {},
    signal,
    {threadId: sessionId, runId: crypto.randomUUID()},
  )
}

export async function runTurn(base: string, sessionId: string, text: string): Promise<void> {
  const abort = new AbortController()
  try {
    for await (const chunk of turnStream(base, sessionId, text, abort.signal)) {
      if (isFinal(chunk)) return
    }
  } finally {
    abort.abort()
  }
}

export function sendTurn(base: string, sessionId: string, text: string): Promise<TurnHandle> {
  const abort = new AbortController()
  const finished = {resolve: (): void => {}}
  const done = new Promise<void>((resolve) => {
    finished.resolve = resolve
  })
  const replying = {resolve: (): void => {}}
  const replied = new Promise<void>((resolve) => {
    replying.resolve = resolve
  })
  const started = new Promise<void>((resolve) => {
    const drain = async (): Promise<void> => {
      for await (const chunk of turnStream(base, sessionId, text, abort.signal)) {
        if (isStart(chunk)) resolve()
        if (isReplyText(chunk)) replying.resolve()
        if (isFinal(chunk)) break
      }
    }
    void drain()
      .catch(() => {})
      .finally(() => {
        resolve()
        replying.resolve()
        finished.resolve()
      })
  })
  return started.then(() => ({
    awaitTurnEnd: () => done,
    awaitReply: () => replied,
    close: () => abort.abort(),
  }))
}

type AppContextValueOptions = {
  base: string
  sessionId?: string
  announce?: (message: string) => void
  instances?: ExtensionInstance[]
  transport?: ChatTransportPreference
}

function makeAppContextValue(options: AppContextValueOptions, client: BrowserRpcClient): AppContextValue {
  const {rpc} = client
  const queryClient = new QueryClient()
  const announce = options.announce
  const data = makeAppData(rpc, queryClient)
  const connected = () => true
  const liveSessions = makeLiveSessions({
    active: () => null,
    rpc,
    apiBase: () => options.base,
    generation: () => 0,
    transport: () => options.transport,
    appData: data,
    queryClient,
    announce: (message) => announce?.(message),
  })
  return {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data,
    liveSessions,
    warmSession: createWarmSession(data, connected, queryClient),
    queryClient,
    announce: (message) => announce?.(message),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabAnchor: () => ({
      corner: 'bottom-right',
      left: 'calc(100% - 4.5rem)',
      right: '1.25rem',
      top: 'calc(100% - 4.5rem)',
    }),
    instances: options.instances ?? [],
    connected,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => options.base,
    notifyInteractive: () => {},
    theme: () => ({scheme: 'dark', skin: 'conciv', skinFromPage: false}),
    preferences: createPreferences({
      settings: createClientSettings(rpc, 'conciv'),
      data,
      queryClient,
      connected,
      host: parseConcivSettings(''),
    }),
  }
}

export type PaneMountOptions = {
  base: string
  sessionId: string
  grabProvider?: GrabProvider
  extensions?: AnyExtension[]
  ground?: (grab: Grab) => Promise<Grab | null>
  width?: number
  transport?: ChatTransportPreference
  onNewSession?: () => void
}

export type PaneMount = {
  dispose: () => void
  pane: PaneContextValue
  data: AppData
  queryClient: QueryClient
  refetch: () => Promise<void>
  setWidth: (pixels: number) => void
}

const DEFAULT_PANE_WIDTH_PX = 400

function AnnounceLog(props: {entries: () => string[]}): JSX.Element {
  return (
    <div aria-live="polite" role="log" aria-label="Announcements">
      {props.entries().join(' | ')}
    </div>
  )
}

export function mountPane(options: PaneMountOptions, view: (pane: PaneContextValue) => JSX.Element): PaneMount {
  const instances = createInstances(options.extensions ?? [])
  const [announced, setAnnounced] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(options.width ?? DEFAULT_PANE_WIDTH_PX)
  const client = makeBrowserRpcClient(options.base, {session: () => options.sessionId})
  const chatRoot = createRoot((disposeChat) => {
    const app = makeAppContextValue(
      {
        base: options.base,
        sessionId: options.sessionId,
        announce: (message) => setAnnounced((entries) => [...entries, message]),
        instances,
        transport: options.transport,
      },
      client,
    )
    const {data, queryClient} = app
    const chat = app.liveSessions.open(() => options.sessionId)
    const coordinator = makeRefreshCoordinator({
      chat,
      liveSessions: app.liveSessions,
      sessionId: () => options.sessionId,
      appData: data,
      queryClient,
      announce: app.announce,
    })
    return {app, chat, coordinator, dispose: disposeChat}
  })
  const {app} = chatRoot
  const {rpc, data, queryClient} = app
  const pane: PaneContextValue = {
    sessionId: () => options.sessionId,
    running: () => false,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStaging: makeGrabStaging({ground: options.ground ?? (async () => null)}),
    grabProvider: options.grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => options.onNewSession?.(),
    chat: chatRoot.chat,
    refresh: chatRoot.coordinator.refresh,
    isRefreshing: chatRoot.coordinator.isRefreshing,
  }
  const reachabilityRoot = createRoot((disposeReachability) => ({
    reachability: makeEngineReachability(),
    dispose: disposeReachability,
  }))
  const mounted = render(() => (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={app}>
        <EngineReachabilityContext.Provider value={reachabilityRoot.reachability}>
          <NoticeContextProvider>
            <PaneContext.Provider value={pane}>
              <HostApiProvider
                rpc={rpc}
                apiBase={() => options.base}
                toast={(message) => app.announce(message)}
                dialog={app.layers.track(Dialog)}
              >
                <div class="flex flex-col h-150" style={{width: `${width()}px`}}>
                  {view(pane)}
                  <NoticeSurface />
                </div>
                <AnnounceLog entries={announced} />
              </HostApiProvider>
            </PaneContext.Provider>
          </NoticeContextProvider>
        </EngineReachabilityContext.Provider>
      </AppContext.Provider>
    </QueryClientProvider>
  ))
  return {
    dispose: () => {
      mounted.unmount()
      for (const instance of instances) instance.dispose()
      chatRoot.dispose()
      reachabilityRoot.dispose()
      client.close()
    },
    pane,
    data,
    queryClient,
    refetch: () => queryClient.invalidateQueries({queryKey: data.utils.meta.engine.key()}),
    setWidth,
  }
}

export type ShellMountOptions = {
  transport?: ChatTransportPreference
  host?: Record<string, unknown>
  apiBase?: () => string
  login?: {apiBase: string; tokenSource?: EngineTokenSource}
}

type ShellHarness = {
  mountShell: (entry: string | string[], extensions?: AnyExtension[], options?: ShellMountOptions) => void
  dispose: () => void
  pathname: () => string | undefined
  href: () => string
  back: () => void
}

export function createShellHarness(base: () => string): ShellHarness {
  const mounted: {
    router: ReturnType<typeof createConcivRouter> | null
    disposeLogin: () => void
    unmount: () => void
    closeRpc: () => void
  } = {
    router: null,
    disposeLogin: () => {},
    unmount: () => {},
    closeRpc: () => {},
  }

  const mountShell = (
    entry: string | string[],
    extensions: AnyExtension[] = [],
    options: ShellMountOptions = {},
  ): void => {
    const apiBase = options.login?.apiBase ?? base()
    const loginOptions = options.login
    const login =
      loginOptions &&
      createRoot((disposeLogin) => {
        mounted.disposeLogin = disposeLogin
        return createEngineLogin({apiBase: () => apiBase, tokenSource: loginOptions.tokenSource})
      })
    if (login) void startEngineLogin(login)
    const activeSession: {read: () => string | null} = {read: () => null}
    const client = makeBrowserRpcClient(apiBase, {session: () => activeSession.read()})
    mounted.closeRpc = client.close
    const router = createConcivRouter({
      rpc: client.rpc,
      history: createMemoryHistory({initialEntries: [entry].flat()}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(
        JSON.stringify({...options.host, ...(options.transport ? {transport: options.transport} : {})}),
      ),
      apiBase: options.apiBase ?? (() => apiBase),
      connected: () => (login ? engineConnected(login.status()) : true),
      connectionGeneration: () => 0,
      extensions,
      login,
      bindActiveSession: (read) => {
        activeSession.read = read
      },
    })
    mounted.router = router
    mounted.unmount = render(() => <RouterProvider router={router} />).unmount
  }

  const dispose = (): void => {
    if (mounted.router) disposeConcivRouter(mounted.router)
    mounted.router = null
    mounted.unmount()
    mounted.unmount = () => {}
    mounted.disposeLogin()
    mounted.disposeLogin = () => {}
    mounted.closeRpc()
    mounted.closeRpc = () => {}
    window.dispatchEvent(new Event('online'))
  }

  return {
    mountShell,
    dispose,
    pathname: () => mounted.router?.state.location.pathname,
    href: () => mounted.router?.state.location.href ?? '',
    back: () => mounted.router?.history.back(),
  }
}

const VIEWPORT_SELECTOR = '[role="log"][aria-live="off"]'
const SETTLE_PASSES = 3
const JANK_FRAME_MS = 33

type FrameGaps = {sampledMs: number; p50: number; p95: number; max: number; over33: number}

export type CalmWatch = {
  checkpoint: () => Promise<void>
  frameGaps: () => FrameGaps
  stop: () => void
}

type FrameGapSampler = {gaps: () => FrameGaps; pause: () => void; resume: () => void}

function threadViewport(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
  if (!viewport) throw new Error('the calm harness could not find the thread viewport')
  return viewport
}

function hasFiniteIterations(animation: Animation): boolean {
  return animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function settleMotion(viewport: HTMLElement): Promise<void> {
  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    await nextFrames()
    const running = viewport.getAnimations({subtree: true}).filter(hasFiniteIterations)
    if (running.length === 0) return
    await Promise.allSettled(running.map((animation) => animation.finished))
  }
}

function percentileOf(sorted: ReadonlyArray<number>, fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

function tenths(value: number): number {
  return Math.round(value * 10) / 10
}

function summariseGaps(gaps: ReadonlyArray<number>): FrameGaps {
  const sorted = gaps.toSorted((left, right) => left - right)
  return {
    sampledMs: tenths(gaps.reduce((total, gap) => total + gap, 0)),
    p50: tenths(percentileOf(sorted, 0.5)),
    p95: tenths(percentileOf(sorted, 0.95)),
    max: tenths(sorted.at(-1) ?? 0),
    over33: gaps.filter((gap) => gap > JANK_FRAME_MS).length,
  }
}

function startFrameGapSampler(): FrameGapSampler {
  const gaps: number[] = []
  let previous = performance.now()
  let handle = 0
  const tick = (): void => {
    const now = performance.now()
    gaps.push(now - previous)
    previous = now
    handle = requestAnimationFrame(tick)
  }
  const resume = (): void => {
    previous = performance.now()
    handle = requestAnimationFrame(tick)
  }
  resume()
  return {gaps: () => summariseGaps(gaps), pause: () => cancelAnimationFrame(handle), resume}
}

function createCalmWatch(): CalmWatch {
  const sampler = startFrameGapSampler()
  return {
    checkpoint: async () => {
      sampler.pause()
      try {
        await settleMotion(threadViewport())
      } finally {
        sampler.resume()
      }
    },
    frameGaps: sampler.gaps,
    stop: sampler.pause,
  }
}

const MULTI_TOOL_STEPS = 20
const MULTI_TOOL_PACE_MS = 50
const BOUNDARY_PACE_MS = 400
const EDIT_STEP_INTERVAL = 5
const DIFF_BEFORE = [
  'export function total(items: Item[]): number {',
  '  let sum = 0',
  '  for (const item of items) sum += item.price',
  '  return sum',
  '}',
].join('\n')
const DIFF_AFTER = [
  'export function total(items: readonly Item[]): number {',
  '  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)',
  '}',
].join('\n')
const STREAMED_CODE_LINES = 40
const STREAMED_TEXT_CHUNK = 56
const STREAMED_TEXT_PACE_MS = 30
const STREAMED_CODE_CLOSING = 'That is the whole helper.'
const SEEDED_EXCHANGES = Math.floor((VIRTUALIZE_THRESHOLD - 4) / 2)
const LONG_CHAT_EXCHANGES = CHAT_HISTORY_PAGE_SIZE / 2

const core = {base: ''}
const active: {pane: PaneMount | null; watch: CalmWatch | null} = {pane: null, watch: null}

export function registerCalmCore(id: string): void {
  beforeAll(async () => {
    const booted = await coreControl.bootCore({id, allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(async () => {
    active.watch?.stop()
    active.watch = null
    await coreControl.releaseTools()
    await coreControl.releaseResults()
    await coreControl.releaseTurn()
    await coreControl.clearScript()
    active.pane?.dispose()
    active.pane = null
  })
}

async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
  const rpc = coreRpc(core.base)
  return {rpc, sessionId: await createSession(rpc)}
}

function mountChatPane(sessionId: string): PaneMount {
  const mount = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)
  active.pane = mount
  return mount
}

function watchCalm(): CalmWatch {
  const watch = createCalmWatch()
  active.watch = watch
  return watch
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const stopButton = () => page.getByRole('button', {name: 'Stop generating'})

async function promptWith(text: string): Promise<void> {
  await expect.element(input()).toBeVisible()
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText(text)).toBeVisible()
}

type ScriptedToolStep = {name: string; input: Record<string, string>}

function editStep(index: number): ScriptedToolStep {
  return {name: 'Edit', input: {file_path: `step-${index}.tsx`, old_string: DIFF_BEFORE, new_string: DIFF_AFTER}}
}

function multiToolStep(index: number): ScriptedToolStep {
  if (index > 0 && index % EDIT_STEP_INTERVAL === 0) return editStep(index)
  if (index % 2 === 0) return {name: 'Bash', input: {command: `probe step ${index}`}}
  return {name: 'Read', input: {filePath: `step-${index}.tsx`}}
}

function multiToolSteps(): ScriptedToolStep[] {
  return Array.from({length: MULTI_TOOL_STEPS}, (_, index): ScriptedToolStep => multiToolStep(index))
}

function streamedCodeLine(index: number): string {
  return `  const step${index} = await resolve(input.steps[${index}], {retries: ${index % 4}})`
}

function streamedCodeAnswer(): string {
  return [
    'Here is the helper you asked for.',
    '',
    '```ts',
    'export async function resolveEveryStep(input: PipelineInput): Promise<StepResult[]> {',
    ...Array.from({length: STREAMED_CODE_LINES}, (_, index) => streamedCodeLine(index)),
    '  return [step0]',
    '}',
    '```',
    '',
    STREAMED_CODE_CLOSING,
  ].join('\n')
}

async function seedThread(base: string, sessionId: string, exchanges: number): Promise<void> {
  for (let index = 0; index < exchanges; index += 1) {
    await runTurn(base, sessionId, `seeded exchange ${index}`)
  }
}

async function startHeldToolRun(config: {
  prompt: string
  pending: string
  settled: string
  paceMs?: number
}): Promise<CalmWatch> {
  await coreControl.holdTools()
  await coreControl.holdResults()
  await coreControl.holdTurn()
  await promptWith(config.prompt)
  await expect.element(stopButton()).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()
  await coreControl.releaseTools()
  await expect.element(page.getByText(config.pending, {exact: true})).toBeVisible()
  await watch.checkpoint()
  await coreControl.releaseResults(config.paceMs ? {everyMs: config.paceMs} : undefined)
  await expect.element(page.getByText(config.settled, {exact: true})).toBeVisible()
  await watch.checkpoint()
  return watch
}

export async function startMultiToolRun(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: multiToolSteps(), text: 'All twenty steps are done.'})
  mountChatPane(sessionId)
  return startHeldToolRun({
    prompt: 'run twenty tools then answer',
    pending: 'probe step 0',
    settled: `step-${MULTI_TOOL_STEPS - 1}.tsx`,
    paceMs: MULTI_TOOL_PACE_MS,
  })
}

export async function startBoundaryRun(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, SEEDED_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: [
      {name: 'page_fill', input: {selector: '#name', value: 'Ada'}, result: {ok: true, value: 'Ada'}},
      {name: 'page_click', input: {selector: '#save'}, result: {ok: true}},
    ],
    text: 'The long thread is done.',
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${SEEDED_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  await expect.element(page.getByText('seeded exchange 0', {exact: true})).toBeInTheDocument()
  return startHeldToolRun({
    prompt: 'fill and save the form',
    pending: '1 action',
    settled: '2 actions',
    paceMs: BOUNDARY_PACE_MS,
  })
}

export async function streamCodeAnswer(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({
    toolCalls: [],
    text: streamedCodeAnswer(),
    textPace: {chunk: STREAMED_TEXT_CHUNK, everyMs: STREAMED_TEXT_PACE_MS},
  })
  mountChatPane(sessionId)
  await coreControl.holdTools()
  await promptWith('write the helper that resolves every step')
  await expect.element(stopButton()).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()
  await coreControl.releaseTools()
  await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
  await watch.checkpoint()
  return watch
}

export async function glideToLatestFromFarUp(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, LONG_CHAT_EXCHANGES)
  mountChatPane(sessionId)
  const exchange = (index: number) => page.getByText(`seeded exchange ${index}`, {exact: true})
  const latest = page.getByRole('button', {name: 'Scroll to bottom'})
  await expect.element(exchange(LONG_CHAT_EXCHANGES - 1)).toBeVisible()
  await userEvent.click(exchange(LONG_CHAT_EXCHANGES - 1))
  await userEvent.keyboard('{Home}')
  await expect.element(exchange(0)).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()
  await userEvent.click(latest)
  await expect.element(exchange(LONG_CHAT_EXCHANGES - 1)).toBeInViewport()
  await expect.element(latest).toBeDisabled()
  await watch.checkpoint()
  return watch
}

export function bootedCore(id: string, extra: Omit<BootCoreInput, 'id' | 'allowedOrigins'> = {}): () => string {
  const core = {base: ''}
  beforeAll(async () => {
    const booted = await coreControl.bootCore({...extra, id, allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)
  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)
  return () => core.base
}

type KeptPane = (mount: PaneMount) => PaneMount

export function keptPane(): KeptPane {
  const active: {pane: PaneMount | null} = {pane: null}
  afterEach(() => {
    active.pane?.dispose()
    active.pane = null
  })
  return (mount) => {
    active.pane = mount
    return mount
  }
}

type TrackedFaults = {
  install: (spec: FaultSpec) => Promise<string>
  releaseAll: () => Promise<void>
}

export function trackedFaults(): TrackedFaults {
  const handles: string[] = []
  const install = async (spec: FaultSpec): Promise<string> => {
    const handle = await coreControl.installFault(spec)
    handles.push(handle)
    return handle
  }
  const releaseAll = async (): Promise<void> => {
    for (const handle of handles.splice(0)) await coreControl.releaseFault(handle)
  }
  afterEach(releaseAll)
  return {install, releaseAll}
}

export const HERO_GRAB: Grab = {
  text: '<h1 class="title">Payroll Deposit</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Payroll Deposit</h1>',
  preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

export const HERO_LABEL = 'Hero at src/routes/index.tsx:12'

export function persistedGrab(id: string, grab: Grab): PersistedAttachment {
  const bytes = new TextEncoder().encode(JSON.stringify(grabToPayload(grab)))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return {id, type: 'document', name: GRAB_FILE_NAME, contentType: GRAB_MIME, data: btoa(binary)}
}

export function grabProviderFor(...grabs: Grab[]): GrabProvider {
  const queue = [...grabs]
  const take = async (): Promise<Grab> => (queue.length > 1 ? (queue.shift() ?? HERO_GRAB) : (queue[0] ?? HERO_GRAB))
  return () => ({pick: take, comment: take, cancel: () => {}, isActive: () => false})
}

export function memoryStorage(): WebStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

type Locator = ReturnType<typeof page.getByText>

export async function expectRetryRecovers(
  clearFailure: () => Promise<void>,
  editor: () => Locator,
  failureLocator: () => Locator,
): Promise<void> {
  await clearFailure()
  await page.getByRole('button', {name: 'Retry'}).click()
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(failureLocator()).not.toBeInTheDocument()
}
