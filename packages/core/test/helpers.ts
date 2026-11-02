import {mkdtempSync} from 'node:fs'
import {writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect} from 'vitest'
import {type ChatPlane} from '@conciv/chat'
import {type ConcivDb} from '@conciv/db'
import {type AnyExtension, type ConcivPlugin} from '@conciv/extension'
import {getHarness, type HarnessAdapter} from '@conciv/harness'
import {
  type ChatMessage,
  type Kit,
  type RunEvents,
  createTestkit,
  type BootApp,
  createTestHarness,
  type TestHarness,
} from '@conciv/harness-testkit'
import {type BundlerBridge} from '@conciv/protocol/bundler-types'
import {type ChatEvent, ChatEventType} from '@conciv/protocol/chat-event-types'
import {type HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {type PageOutcome} from '@conciv/protocol/page-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import type {DevframeDefinition} from 'devframe'
import {z} from 'zod'
import {makeApp, type MadeApp} from '../src/app.js'
import {type ResolvedConcivConfig} from '../src/config.js'
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

export async function runTurn(kit: Kit, input: string | ChatMessage, session: string): Promise<RunEvents> {
  const stream = await kit.turn(input, {session})
  return stream.done()
}

export type BootOverrides = {
  cwd?: string
  claudeHome?: string
  extensions?: AnyExtension[]
  plugins?: readonly ConcivPlugin[]
  devframes?: DevframeDefinition[]
  extensionConfig?: Record<string, unknown>
  openInEditor?: (file: string, line?: number) => void
  bridge?: BundlerBridge
  firstChunkTimeoutMs?: number
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
    devframes: overrides.devframes,
  }
  return makeApp({
    cfg,
    cwd: overrides.cwd ?? env.cwd,
    openInEditor: overrides.openInEditor ?? (() => {}),
    harness: env.harness,
    claudeHome: overrides.claudeHome,
    extensions: overrides.extensions,
    plugins: overrides.plugins,
    extensionConfig: overrides.extensionConfig,
    bridge: overrides.bridge,
    firstChunkTimeoutMs: overrides.firstChunkTimeoutMs,
  })
}

export function bootCoreApp(overrides: BootOverrides = {}): BootApp {
  return async (env) => {
    const {fetch, dispose, hub, claimUpgrade, loginToken} = await bootMadeApp(env, overrides)
    return {fetch, dispose, hub, claimUpgrade, loginToken}
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

export async function hydratedSnapshot(kit: Kit, sessionId: string): Promise<SnapshotView> {
  const hydration = await kit.hydrate(sessionId)
  return asSnapshot(aguiSnapshotFor(hydration.messages))
}

export type FakeWidget = {end: () => void; seen: () => string[]}

export async function connectWidget(kit: Kit, answerFor: (name: string) => PageOutcome): Promise<FakeWidget> {
  const seen: string[] = []
  const tab = await kit.pageTab((query) => {
    const name =
      typeof query === 'object' && query !== null && 'name' in query && typeof query.name === 'string' ? query.name : ''
    seen.push(name)
    return answerFor(name)
  })
  return {end: () => tab.close(), seen: () => [...seen]}
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
    const sessionId = (await kit.hub.call('conciv:sessions:resolve', {id: opts.sessionId})).sessionId
    if (opts.model) await kit.hub.call('conciv:sessions:model', {sessionId, model: opts.model})
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
