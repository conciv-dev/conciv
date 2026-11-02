import {commands, page, userEvent} from 'vitest/browser'
import {
  type EngineStaleness,
  makeRpcClient,
  type PersistedAttachment,
  type RpcClient,
  browserRpcConnection,
  closeBrowserRpcConnection,
  makeBrowserRpcClient,
} from '@conciv/contract'
import type {PacedRelease, ScriptedTurn} from '@conciv/harness-testkit'
import type {BootCoreInput, BootCoreResult, FaultSpec} from './commands/core-control.js'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {fetchServerSentEvents} from '@conciv/ai/client'
import {CHAT_SSE_PATH, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {type AppContextValue, AppContext} from '../src/app/context.js'
import {makeLiveSessions} from '../src/app/live-sessions.js'
import {createWarmSession} from '../src/app/warm-session.js'
import {makeAppData, type AppData} from '../src/data/app-data.js'
import {parseConcivSettings} from '../src/data/settings.js'
import {makeLayerStack} from '../src/shell/dialogs.js'
import type {ExtensionInstance} from '../src/extension/extension-slots.js'
import {createMemo, createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import '../src/lib/api-base.js'
import {HostApiProvider} from '@conciv/extension/host'
import {EngineReachabilityContext, makeEngineReachability} from '../src/app/reachability.js'
import type {AnyExtension} from '@conciv/extension'
import type {Grab, GrabProvider} from '@conciv/grab'
import {useChatSession, type ChatTransportPreference} from '@conciv/client'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../src/app/pane-context.js'
import {createInstances} from '../src/extension/create-instances.js'
import {makeGrabStaging} from '../src/pane/grab-staging.js'
import {makeRefreshCoordinator} from '../src/pane/refresh-coordinator.js'
import {createHarnessMeta, HarnessMetaContext} from '../src/data/harness-meta.js'
import {NoticeContextProvider, NoticeSurface} from '../src/shell/notice-context.js'
import {onlineManager} from '@tanstack/query-core'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'
import {hubFor, type HubConnection} from '../src/app/devframe-link.js'
import {afterAll, afterEach, beforeAll, expect} from 'vitest'
import {VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'
import {ChatPane} from '../src/pane/chat-pane.js'
import {GRAB_FILE_NAME, GRAB_MIME, grabToPayload} from '@conciv/grab/grab-attachment'
import type {WebStorage} from '@conciv/storage-history'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    bootCore: (input: BootCoreInput) => Promise<BootCoreResult>
    closeCore: () => Promise<void>
    pushSocketsOpened: () => Promise<number>
    outsideReload: (sessionId: string, file: string) => Promise<string>
    setStaleness: (value: EngineStaleness) => Promise<void>
    holdTurn: () => Promise<void>
    holdTools: () => Promise<void>
    releaseTools: () => Promise<void>
    holdResults: () => Promise<void>
    releaseResults: (paced?: PacedRelease) => Promise<void>
    releaseTurn: () => Promise<void>
    scriptTurn: (turn: ScriptedTurn) => Promise<string[]>
    clearScript: () => Promise<void>
    scriptCustomEvent: (name: string, value: unknown) => Promise<void>
    setTerminalLaunch: (succeeds: boolean) => Promise<void>
    terminalLaunches: () => Promise<number>
    rpcCallCount: (path: string[]) => Promise<number>
    installFault: (spec: FaultSpec) => Promise<string>
    releaseFault: (handle: string) => Promise<void>
    faultPending: (handle: string) => Promise<number>
    awaitFaultPending: (handle: string, count: number) => Promise<void>
  }
}

export const coreControl = commands

type SeededDraft = {text?: string; attachments?: PersistedAttachment[]}

type TurnHandle = {awaitTurnEnd: () => Promise<void>; close: () => void}

export function coreRpc(base: string): RpcClient {
  return makeRpcClient(base)
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
  const started = new Promise<void>((resolve) => {
    const drain = async (): Promise<void> => {
      for await (const chunk of turnStream(base, sessionId, text, abort.signal)) {
        if (isStart(chunk)) resolve()
        if (isFinal(chunk)) break
      }
    }
    void drain()
      .catch(() => {})
      .finally(() => {
        resolve()
        finished.resolve()
      })
  })
  return started.then(() => ({
    awaitTurnEnd: () => done,
    close: () => abort.abort(),
  }))
}

type AppContextValueOptions = {
  base: string
  sessionId?: string
  announce?: (message: string) => void
  instances?: ExtensionInstance[]
}

function makeAppContextValue(options: AppContextValueOptions): AppContextValue {
  const rpc = makeRpcClient(
    options.base,
    options.sessionId === undefined ? {} : {headers: {[CONCIV_SESSION_HEADER]: options.sessionId}},
  )
  const queryClient = new QueryClient()
  const announce = options.announce
  const data = makeAppData(rpc, undefined, queryClient)
  const connected = () => true
  return {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data,
    liveSessions: makeLiveSessions(),
    warmSession: createWarmSession(data, connected, queryClient),
    queryClient,
    announce: (message) => announce?.(message),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabPosition: () => 'bottom-right',
    instances: options.instances ?? [],
    connected,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => options.base,
    notifyInteractive: () => {},
    theme: () => ({scheme: 'dark', skin: 'conciv'}),
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
  window.__CONCIV_API_BASE__ = options.base
  browserRpcConnection(options.base)
  const instances = createInstances(options.extensions ?? [])
  const [announced, setAnnounced] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(options.width ?? DEFAULT_PANE_WIDTH_PX)
  const app = makeAppContextValue({
    base: options.base,
    sessionId: options.sessionId,
    announce: (message) => setAnnounced((entries) => [...entries, message]),
    instances,
  })
  const {rpc, data, queryClient} = app
  const chatRoot = createRoot((disposeChat) => {
    const chat = createMemo(() =>
      useChatSession({
        rpc,
        apiBase: options.base,
        sessionId: options.sessionId,
        ...(options.transport === undefined ? {} : {connection: {transport: options.transport}}),
      }),
    )
    const coordinator = makeRefreshCoordinator({
      chat,
      sessionId: () => options.sessionId,
      appData: data,
      queryClient,
      announce: app.announce,
    })
    return {chat, coordinator, dispose: disposeChat}
  })
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
  const harnessRoot = createRoot((disposeHarness) => ({
    harness: createHarnessMeta(data, () => true, queryClient),
    dispose: disposeHarness,
  }))
  const reachabilityRoot = createRoot((disposeReachability) => ({
    reachability: makeEngineReachability(),
    dispose: disposeReachability,
  }))
  const mounted = render(() => (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={app}>
        <HarnessMetaContext.Provider value={harnessRoot.harness}>
          <EngineReachabilityContext.Provider value={reachabilityRoot.reachability}>
            <NoticeContextProvider>
              <PaneContext.Provider value={pane}>
                <HostApiProvider rpc={rpc} apiBase={() => ''} toast={(message) => app.announce(message)}>
                  <div class="flex flex-col h-150" style={{width: `${width()}px`}}>
                    {view(pane)}
                    <NoticeSurface />
                  </div>
                  <AnnounceLog entries={announced} />
                </HostApiProvider>
              </PaneContext.Provider>
            </NoticeContextProvider>
          </EngineReachabilityContext.Provider>
        </HarnessMetaContext.Provider>
      </AppContext.Provider>
    </QueryClientProvider>
  ))
  return {
    dispose: () => {
      mounted.unmount()
      for (const instance of instances) instance.dispose()
      chatRoot.dispose()
      harnessRoot.dispose()
      reachabilityRoot.dispose()
      closeBrowserRpcConnection(options.base)
      delete window.__CONCIV_API_BASE__
    },
    pane,
    data,
    queryClient,
    refetch: () => queryClient.invalidateQueries({queryKey: data.utils.meta.engine.key()}),
    setWidth,
  }
}

export type ShellMountOptions = {transport?: ChatTransportPreference}

type ShellHarness = {
  mountShell: (entry: string, extensions?: AnyExtension[], options?: ShellMountOptions) => void
  dispose: () => void
}

export function createShellHarness(base: () => string): ShellHarness {
  const mounted: {router: ReturnType<typeof createConcivRouter> | null; hub: HubConnection | null} = {
    router: null,
    hub: null,
  }

  const mountShell = (entry: string, extensions: AnyExtension[] = [], options: ShellMountOptions = {}): void => {
    const apiBase = base()
    window.__CONCIV_API_BASE__ = apiBase
    const hub = hubFor(apiBase)
    mounted.hub = hub
    const router = createConcivRouter({
      rpc: makeBrowserRpcClient(apiBase).rpc,
      hubConnection: hub,
      history: createMemoryHistory({initialEntries: [entry]}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(options.transport ? JSON.stringify({transport: options.transport}) : ''),
      apiBase: () => apiBase,
      connectionGeneration: () => 0,
      extensions,
    })
    mounted.router = router
    render(() => <RouterProvider router={router} />)
  }

  const dispose = (): void => {
    if (mounted.router) disposeConcivRouter(mounted.router)
    mounted.router = null
    mounted.hub?.close()
    mounted.hub = null
    closeBrowserRpcConnection(base())
    onlineManager.setOnline(true)
    delete window.__CONCIV_API_BASE__
  }

  return {mountShell, dispose}
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
  const tick = (now: number): void => {
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
