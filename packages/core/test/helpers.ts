import {existsSync, realpathSync, unlinkSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {uniq} from 'es-toolkit'
import {afterAll, expect, onTestFinished} from 'vitest'
import {inside} from '@conciv/harness/cwd'
import {type ChatPlane} from '@conciv/chat'
import {type ConcivDb} from '@conciv/db'
import {type AnyExtension} from '@conciv/extension'
import type {Plugin} from '@conciv/plugin'
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
import type * as Bundler from '@conciv/plugin/schema/bundler'
import {type ChatEvent, ChatEventType} from '@conciv/protocol/chat-event-types'
import {HarnessSessionId, type HubAccess, SessionId} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {z} from 'zod'
import {makeApp, type MadeApp} from '../src/app.js'
import {type ResolvedConcivConfig} from '../src/config.js'
import {ensureRow} from '../src/sessions/session-rows.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

export function requireClaude(): HarnessAdapter {
  const adapter = getHarness('claude')
  if (!adapter) throw new Error('claude adapter not registered')
  return adapter
}

export function requireTranscriptPath(adapter: HarnessAdapter): (cwd: string, sessionId: HarnessSessionId) => string {
  const path = adapter.history?.transcriptPath
  if (!path) throw new Error(`${adapter.id} adapter exposes no transcript path`)
  return path
}

export const runReal = !process.env.CI

const SessionEventSchema = z.object({sessionId: HarnessSessionId}).loose()

const removedTranscripts: string[] = []

afterAll(() => {
  expect(removedTranscripts.filter((path) => existsSync(path))).toEqual([])
})

function removeTranscripts(
  harness: HarnessAdapter,
  cwd: string,
  projectExistedBefore: boolean,
  sessionIds: HarnessSessionId[],
): void {
  const history = harness.history
  if (history?.transcriptPath === undefined) {
    console.warn(`${harness.id} gives no exact transcript path: left session(s) [${sessionIds.join(', ')}] of ${cwd}`)
    return
  }
  if (sessionIds.length === 0) {
    console.warn(`${harness.id} turn in ${cwd} returned no session id: removed nothing`)
    return
  }
  if (projectExistedBefore || !inside(realpathSync(tmpdir()), cwd)) {
    console.warn(`${history.transcriptRoot(cwd)} is not this run's own: left session(s) [${sessionIds.join(', ')}]`)
    return
  }
  const failures = uniq(sessionIds).flatMap((sessionId) => {
    const path = history.transcriptPath(cwd, sessionId)
    if (dirname(path) !== history.transcriptRoot(cwd)) return [`${path} is outside ${history.transcriptRoot(cwd)}`]
    removedTranscripts.push(path)
    try {
      unlinkSync(path)
      return []
    } catch (error) {
      return [`${path}: ${String(error)}`]
    }
  })
  if (failures.length > 0) console.warn(`transcripts left in the home:\n${failures.join('\n')}`)
}

export function removeTurnTranscripts(
  harness: HarnessAdapter,
  cwd: string,
  sessionEvent: string,
): (events: RunEvents) => void {
  const realCwd = realpathSync(cwd)
  const projectExistedBefore =
    harness.history?.transcriptPath === undefined || existsSync(harness.history.transcriptRoot(realCwd))
  const sessionIds: HarnessSessionId[] = []
  onTestFinished(() => removeTranscripts(harness, realCwd, projectExistedBefore, sessionIds))
  return (events) => {
    sessionIds.push(
      ...events.custom(sessionEvent).flatMap((value) => {
        const parsed = SessionEventSchema.safeParse(value)
        return parsed.success ? [parsed.data.sessionId] : []
      }),
    )
  }
}

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

function readText(message: SnapshotMessage): string {
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
  return snapshot.messages.filter((message) => message.role === 'user').map(readText)
}

export async function runTurn(kit: Kit, input: string | ChatMessage, session: string): Promise<RunEvents> {
  const stream = await kit.turn(input, {session})
  return stream.done()
}

export type BootOverrides = {
  cwd?: string
  extensions?: AnyExtension[]
  extensionConfig?: Record<string, unknown>
  openInEditor?: (file: string, line?: number, column?: number) => void
  bridge?: Bundler.BundlerBridge
  firstChunkTimeoutMs?: number
  pageReplyTimeoutMs?: number
  queuedActionTimeoutMs?: number
  hubAccess?: HubAccess
  harnesses?: HarnessAdapter[]
  systemPromptText?: string
  home?: string
  plugins?: readonly Plugin.Plugin[]
  configPlugins?: ResolvedConcivConfig['plugins']
  permissions?: ResolvedConcivConfig['permissions']
}

export function bootKit(overrides: BootOverrides = {}, harness: HarnessAdapter = requireClaude()): Promise<Kit> {
  return createTestkit(harness, bootCoreApp(overrides)).setup()
}

export type BootEnv = {stateRoot: string; cwd: string; harness: HarnessAdapter; print: (text: string) => void}

const running = new Set<MadeApp>()

afterAll(async () => {
  await Promise.all([...running].map((app) => app.dispose()))
})

export async function bootMadeApp(env: BootEnv, overrides: BootOverrides = {}): Promise<MadeApp> {
  const cfg: ResolvedConcivConfig = {
    enabled: true,
    stateRoot: env.stateRoot,
    harness: env.harness.id,
    harnessBin: undefined,
    sessionId: undefined,
    harnessSessionId: undefined,
    systemPrompt: '',
    hubAccess: overrides.hubAccess ?? 'session',
    plugins: overrides.configPlugins ?? [],
    policies: [],
    permissions: overrides.permissions ?? [],
  }
  const made = await makeApp({
    print: env.print,
    cfg,
    cwd: overrides.cwd ?? env.cwd,
    openInEditor: overrides.openInEditor ?? (() => {}),
    harness: env.harness,
    extensions: overrides.extensions,
    extensionConfig: overrides.extensionConfig,
    bridge: overrides.bridge,
    firstChunkTimeoutMs: overrides.firstChunkTimeoutMs,
    pageReplyTimeoutMs: overrides.pageReplyTimeoutMs,
    queuedActionTimeoutMs: overrides.queuedActionTimeoutMs,
    harnesses: overrides.harnesses,
    systemPromptText: overrides.systemPromptText,
    home: overrides.home,
    plugins: overrides.plugins,
  })
  const tracked: MadeApp = {
    ...made,
    dispose: async () => {
      running.delete(tracked)
      await made.dispose()
    },
  }
  running.add(tracked)
  return tracked
}

export function bootCoreApp(overrides: BootOverrides = {}): BootApp {
  return async (env) => {
    const {fetch, dispose, agentToken, awaitActivation} = await bootMadeApp(env, overrides)
    await awaitActivation()
    return {fetch, dispose, agentToken}
  }
}

export type ChatFixture = {
  plane: ChatPlane
  db: ConcivDb
  harness: TestHarness
  sessionId: SessionId
  stateRoot: string
  runtime: MadeApp['runtime']
  pluginHost: MadeApp['pluginHost']
  rows: MadeApp['chat']['rows']
  dispose: () => Promise<void>
}

export async function makeChatFixture(opts: {seedSession?: boolean} = {}): Promise<ChatFixture> {
  const harness = createTestHarness(requireClaude())
  const stateRoot = tempDir('conciv-fixture-')
  const made = await bootMadeApp({stateRoot, cwd: stateRoot, harness, print: () => {}})
  const sessionId = SessionId.parse('conciv_fixture')
  if (opts.seedSession !== false) await ensureRow(made.chat.rows, sessionId)
  return {
    plane: made.plane,
    db: made.chat.db,
    harness,
    sessionId,
    stateRoot,
    runtime: made.runtime,
    pluginHost: made.pluginHost,
    rows: made.chat.rows,
    dispose: made.dispose,
  }
}

export async function hydratedSnapshot(kit: Kit, sessionId: string): Promise<SnapshotView> {
  const hydration = await kit.hydrate(sessionId)
  return asSnapshot(aguiSnapshotFor(hydration.messages))
}

export type ResumeScenarioOpts = {
  harness: HarnessAdapter
  dir: string
  sessionId: SessionId
  sessionEvent: string
  model?: string
}

export async function assertTurnAndResume(opts: ResumeScenarioOpts): Promise<void> {
  const keepTranscripts = removeTurnTranscripts(opts.harness, opts.dir, opts.sessionEvent)
  const kit = await bootKit({cwd: opts.dir}, opts.harness)
  try {
    const sessionId = (await kit.rpc.sessions.resolve({id: opts.sessionId})).sessionId
    if (opts.model) await kit.rpc.sessions.model({sessionId, model: opts.model})
    const first = await (
      await kit.turn('Remember the token PLUM42. Reply with exactly OK.', {session: sessionId})
    ).done()
    keepTranscripts(first)
    expect(first.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(first.text().length).toBeGreaterThan(0)
    expect(first.custom(opts.sessionEvent).length).toBeGreaterThan(0)

    const second = await (
      await kit.turn('What was the token I asked you to remember? Reply with the token only.', {session: sessionId})
    ).done()
    keepTranscripts(second)
    expect(second.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(second.text()).toContain('PLUM42')
  } finally {
    await kit.cleanup()
  }
}

export async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  const path = join(tempDir('conciv-chunk-'), 'chunk.js')
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  return path
}
