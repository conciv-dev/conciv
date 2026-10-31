import {mkdtempSync, chmodSync, mkdirSync, writeFileSync} from 'node:fs'
import {writeFile, rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {afterEach, expect} from 'vitest'
import {foldChatEvents} from '@conciv/ai/testkit'
import {type ChatPlane} from '@conciv/chat'
import {type EngineStaleness} from '@conciv/contract'
import {openDb, type ConcivDb} from '@conciv/db'
import {type AnyExtension} from '@conciv/extension'
import {type ToolRegistry} from '@conciv/extension/registry'
import {getHarness, type HarnessAdapter} from '@conciv/harness'
import {
  type ChatMessage,
  type Kit,
  type RunEvents,
  createTestkit,
  type BootApp,
  createTestHarness,
  type TestHarness,
  createFakeHarness,
  type FakeHarness,
} from '@conciv/harness-testkit'
import {type BundlerBridge} from '@conciv/protocol/bundler-types'
import {
  type ChatEvent,
  ChatEventType,
  isRunPhaseTerminal,
  runLifecycleEvent,
  type RunPhase,
} from '@conciv/protocol/chat-event-types'
import {type HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {type PageOutcome} from '@conciv/protocol/page-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {z} from 'zod'
import {makeApp, type MadeApp} from '../src/app.js'
import {type ResolvedConcivConfig} from '../src/config.js'
import {type PageEnv} from '../src/page-bus.js'
import {makeCoreRuntime} from '../src/runtime/core-runtime.js'
import {type SessionPrimitives} from '../src/runtime/primitives.js'
import {type CoreRuntime, type ScopedToolCall} from '../src/runtime/scope-types.js'
import {createSessionBus} from '../src/sessions/session-bus.js'
import {ensureRow} from '../src/sessions/session-rows.js'

export function requireClaude(): HarnessAdapter {
  const adapter = getHarness('claude')
  if (!adapter) throw new Error('claude adapter not registered')
  return adapter
}

export function requireTranscriptPath(
  adapter: HarnessAdapter,
): (cwd: string, sessionId: HarnessSessionId, home?: string) => string {
  const path = adapter.history?.transcriptPath
  if (!path) throw new Error(`${adapter.id} adapter exposes no transcript path`)
  return path
}

export const runReal = !process.env.CI

export const testDb = (): ConcivDb => openDb(mkdtempSync(join(tmpdir(), 'conciv-store-')))

const MessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.string(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).default([]),
  })
  .loose()

const SnapshotSchema = z.object({type: z.literal(ChatEventType.MESSAGES_SNAPSHOT), messages: z.array(MessageSchema)})

type SnapshotMessage = z.infer<typeof MessageSchema>
export type SnapshotView = z.infer<typeof SnapshotSchema>

function textOf(message: SnapshotMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content ?? '')
    .join(' ')
}

export function asSnapshot(chunk: ChatEvent): SnapshotView {
  const parsed = SnapshotSchema.safeParse(chunk)
  if (!parsed.success) throw new Error(`expected a MESSAGES_SNAPSHOT chunk, got ${chunk.type}`)
  return parsed.data
}

export function userTexts(snapshot: SnapshotView): string[] {
  return snapshot.messages.filter((message) => message.role === 'user').map(textOf)
}

export function userMessageIds(snapshot: SnapshotView): Array<string | undefined> {
  return snapshot.messages.filter((message) => message.role === 'user').map((message) => message.id)
}

export function assistantTexts(snapshot: SnapshotView): string[] {
  return snapshot.messages.filter((message) => message.role === 'assistant').map(textOf)
}

export function partTypes(snapshot: SnapshotView): string[] {
  return snapshot.messages.flatMap((message) => message.parts.map((part) => part.type))
}

function rendered(chunks: ChatEvent[]): SnapshotMessage[] {
  return z.array(MessageSchema).parse(foldChatEvents(chunks))
}

export function reconstructSnapshot(chunks: ChatEvent[]): SnapshotView {
  return {type: ChatEventType.MESSAGES_SNAPSHOT, messages: rendered(chunks)}
}

export function reconstructTranscript(chunks: ChatEvent[]): string[] {
  return rendered(chunks).map((message) => `${message.role}: ${textOf(message)}`)
}

export function reconstructUserTexts(chunks: ChatEvent[]): string[] {
  return rendered(chunks)
    .filter((message) => message.role === 'user')
    .map(textOf)
}

export async function collectChunks(source: AsyncIterable<ChatEvent>, into: ChatEvent[]): Promise<void> {
  try {
    for await (const chunk of source) into.push(chunk)
  } catch {}
}

function runIdsAtPhase(chunks: ChatEvent[], match: (phase: RunPhase) => boolean): Set<string> {
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const lifecycle = runLifecycleEvent.parse(chunk)
    if (lifecycle && match(lifecycle.phase)) seen.add(lifecycle.runId)
  }
  return seen
}

export function runsStarted(chunks: ChatEvent[]): number {
  return runIdsAtPhase(chunks, (phase) => phase === 'running').size
}

export function runsFinished(chunks: ChatEvent[]): number {
  return runIdsAtPhase(chunks, isRunPhaseTerminal).size
}

export function peakLiveRuns(chunks: ChatEvent[]): number {
  const open = new Set<string>()
  const tally = {peak: 0}
  for (const chunk of chunks) {
    const lifecycle = runLifecycleEvent.parse(chunk)
    if (!lifecycle) continue
    if (isRunPhaseTerminal(lifecycle.phase)) open.delete(lifecycle.runId)
    if (lifecycle.phase === 'running') open.add(lifecycle.runId)
    tally.peak = Math.max(tally.peak, open.size)
  }
  return tally.peak
}

export async function runTurn(kit: Kit, input: string | ChatMessage, session: string): Promise<RunEvents> {
  const stream = await kit.turn(input, {session})
  return stream.done()
}

export function countType(events: RunEvents, type: string): number {
  return events.all.filter((chunk) => chunk.type === type).length
}

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const fakeClaudePath = fileURLToPath(new URL('./fixtures/fake-claude.ts', import.meta.url))

export type BootOverrides = {
  fakeClaude?: {env?: (sessionId?: string) => NodeJS.ProcessEnv}
  cwd?: string
  claudeHome?: string
  extensions?: AnyExtension[]
  extensionConfig?: Record<string, unknown>
  openInEditor?: (file: string, line?: number) => void
  bridge?: BundlerBridge
  firstChunkTimeoutMs?: number
}

function fakeClaudeBinDir(stateRoot: string): string {
  const binDir = join(stateRoot, 'fake-bin')
  mkdirSync(binDir, {recursive: true})
  const shim = join(binDir, 'claude')
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" --import "${tsxEntry}" "${fakeClaudePath}" "$@"\n`)
  chmodSync(shim, 0o755)
  return binDir
}

export function bootKit(overrides: BootOverrides = {}, harness: HarnessAdapter = requireClaude()): Promise<Kit> {
  return createTestkit(harness, bootCoreApp(overrides)).setup()
}

export type BootEnv = {stateRoot: string; cwd: string; harness: HarnessAdapter}

export function bootMadeApp(env: BootEnv, overrides: BootOverrides = {}): Promise<MadeApp> {
  const cfg: ResolvedConcivConfig = {
    enabled: true,
    widgetUrl: undefined,
    stateRoot: env.stateRoot,
    harness: env.harness.id,
    harnessBin: undefined,
    sessionId: undefined,
    harnessSessionId: undefined,
    systemPrompt: '',
    extensions: undefined,
  }
  const fake = overrides.fakeClaude
  const binDir = fake ? fakeClaudeBinDir(env.stateRoot) : null
  const harnessEnv = binDir
    ? (sessionId?: string): NodeJS.ProcessEnv => ({
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        ...fake?.env?.(sessionId),
      })
    : undefined
  return makeApp({
    cfg,
    cwd: overrides.cwd ?? env.cwd,
    openInEditor: overrides.openInEditor ?? (() => {}),
    harness: env.harness,
    harnessEnv,
    claudeHome: overrides.claudeHome,
    extensions: overrides.extensions,
    extensionConfig: overrides.extensionConfig,
    bridge: overrides.bridge,
    firstChunkTimeoutMs: overrides.firstChunkTimeoutMs,
  })
}

export function bootCoreApp(overrides: BootOverrides = {}): BootApp {
  return async (env) => {
    const {app, dispose} = await bootMadeApp(env, overrides)
    return {fetch: app.fetch, dispose}
  }
}

export type ChatFixture = {
  plane: ChatPlane
  db: ConcivDb
  harness: TestHarness
  sessionId: SessionId
  stateRoot: string
  dispose: () => Promise<void>
}

export async function makeChatFixture(opts: {seedSession?: boolean} = {}): Promise<ChatFixture> {
  const harness = createTestHarness(requireClaude())
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-fixture-'))
  const made = await bootMadeApp({stateRoot, cwd: stateRoot, harness})
  const sessionId = SessionId.parse('conciv_fixture')
  if (opts.seedSession !== false) await ensureRow(made.chat.db, sessionId, harness.id, stateRoot)
  return {plane: made.plane, db: made.chat.db, harness, sessionId, stateRoot, dispose: made.dispose}
}

export const SCRIPTED_REPLY = 'scripted reply'

export type FakeSession = {kit: Kit; harness: FakeHarness; sessionId: string}

export function useFakeSessions(): {open: () => Promise<FakeSession>; adopt: (kit: Kit) => void} {
  const kits: Kit[] = []
  afterEach(async () => {
    for (const kit of kits.splice(0)) await kit.cleanup()
  })
  return {
    adopt: (kit) => {
      kits.push(kit)
    },
    open: async () => {
      const harness = createFakeHarness({text: SCRIPTED_REPLY})
      const kit = await bootKit({}, harness)
      kits.push(kit)
      const sessionId = await kit.session()
      return {kit, harness, sessionId}
    },
  }
}

export async function hydratedSnapshot(kit: Kit, sessionId: string): Promise<SnapshotView> {
  const hydration = await kit.hydrate(sessionId)
  return asSnapshot(aguiSnapshotFor(hydration.messages))
}

export type FakeWidget = {end: () => void; seen: () => string[]}

export async function connectWidget(kit: Kit, answerFor: (name: string) => PageOutcome): Promise<FakeWidget> {
  const ctrl = new AbortController()
  const seen: string[] = []
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  void (async () => {
    try {
      for await (const {requestId, query} of iterator) {
        const name =
          typeof query === 'object' && query !== null && 'name' in query && typeof query.name === 'string'
            ? query.name
            : ''
        seen.push(name)
        void kit.rpc.page.reply({requestId, outcome: answerFor(name)}).catch(() => {})
      }
    } catch {}
  })()
  return {end: () => ctrl.abort(), seen: () => [...seen]}
}

export type ResumeScenarioOpts = {
  harness: HarnessAdapter
  dir: string
  sessionId: SessionId
  sessionEvent: string
  model?: string
}

export async function assertTurnAndResume(opts: ResumeScenarioOpts): Promise<void> {
  const kit = await bootKit({cwd: opts.dir}, opts.harness)
  try {
    const sessionId = (await kit.rpc.sessions.resolve({id: opts.sessionId})).sessionId
    if (opts.model) await kit.rpc.sessions.model({sessionId, model: opts.model})
    const first = await (
      await kit.turn('Remember the token PLUM42. Reply with exactly OK.', {session: sessionId})
    ).done()
    expect(first.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(first.text().length).toBeGreaterThan(0)
    expect(first.custom(opts.sessionEvent).length).toBeGreaterThan(0)

    const second = await (
      await kit.turn('What was the token I asked you to remember? Reply with the token only.', {session: sessionId})
    ).done()
    expect(second.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(second.text()).toContain('PLUM42')
  } finally {
    await kit.cleanup()
  }
}

const FRESH: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}

export async function pageRuntime(page: PageEnv, registry: ToolRegistry): Promise<CoreRuntime> {
  const fixture = await makeChatFixture()
  const primitives: SessionPrimitives = {
    stream: createSessionBus(),
    page,
    registry,
  }
  return makeCoreRuntime({
    primitives,
    plane: fixture.plane,
    db: fixture.db,
    model: () => null,
    staleness: () => FRESH,
  })
}

export function scopedToolCallOf(runtime: CoreRuntime): ScopedToolCall {
  return (name, input, request) =>
    runtime.forSession(request.sessionId).tools.call(name, input, {toolCallId: request.toolCallId})
}

const written: string[] = []

export async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  const path = join(tmpdir(), `conciv-chunk-${Math.random().toString(36).slice(2)}.js`)
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  written.push(path)
  return path
}

export async function cleanupChunks(): Promise<void> {
  for (const f of written.splice(0)) await rm(f, {force: true})
}
