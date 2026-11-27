import {ORPCError} from '@orpc/server'
import {z} from 'zod'
import {contract} from '@conciv/protocol'
import {WidgetDrive} from '@conciv/protocol/simulation'
import type {EngineConnection} from '@conciv/client'
import {
  PLAYGROUND_LABELS,
  type PageEdit,
  type PlaygroundProgress,
  type PlaygroundScript,
  type Turn,
  type UiStep,
} from '../script'
import {createChat} from './demo-chat'
import {createDrive, type Drive} from './demo-drive'
import {createEvents} from './demo-events'
import {buildRouter, demoConnection, type EngineHandlers} from './demo-router'
import {createSessions, createSettings, createTabs, HARNESS_ID} from './demo-store'
import {aborted, createHold, createPace} from './demo-time'

export type DemoBundle = {
  readonly id: string
  readonly file: string
  readonly code: string
}

export type DemoRpc = {
  readonly id: string
  readonly methods: Readonly<Record<string, (input: unknown) => unknown>>
  readonly observe?: (type: string, data: Record<string, unknown>) => void
}

export type DemoEngineOptions = {
  readonly script: PlaygroundScript
  readonly reducedMotion: boolean
  readonly editPage: (edit: PageEdit) => void
  readonly onProgress: (progress: PlaygroundProgress) => void
  readonly bundles: readonly DemoBundle[]
  readonly rpc: readonly DemoRpc[]
  readonly serverBuiltins: readonly string[]
  readonly version: string
}

export type DemoEngine = {
  readonly apiBase: string
  readonly connection: EngineConnection
  readonly play: (signal: AbortSignal) => Promise<void>
  readonly hold: () => void
  readonly resume: () => void
  readonly dispose: () => void
}

const DIRECTORY = '/workspace'

const SentMessage = z.looseObject({id: z.string(), role: z.string(), content: z.unknown()})

const TextPart = z.looseObject({type: z.literal('text'), text: z.string().optional(), content: z.string().optional()})

type Sent = {readonly id: string; readonly text: string}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((part: unknown) => {
      const text = TextPart.safeParse(part)
      return text.success ? [text.data.text ?? text.data.content ?? ''] : []
    })
    .join('')
}

function lastUserMessage(messages: readonly unknown[]): Sent | undefined {
  const user = messages
    .flatMap((message) => {
      const parsed = SentMessage.safeParse(message)
      return parsed.success && parsed.data.role === 'user' ? [parsed.data] : []
    })
    .at(-1)
  return user === undefined ? undefined : {id: user.id, text: contentText(user.content).trim()}
}

function rpcFailed(message: string): never {
  throw new ORPCError('PLUGIN_RPC', {message, data: {type: 'rpc.internal', message}})
}

function pluginNotFound(pluginId: string): never {
  throw new ORPCError('PLUGIN_NOT_FOUND', {
    message: 'no active plugin with a ./plugin-experimental bundle',
    data: {pluginId, message: `the playground serves no plugin ${pluginId}`},
  })
}

function performStep(drive: Drive, step: UiStep, signal: AbortSignal): Promise<void> {
  if (step.kind === 'point') return drive.point(step.role, step.label, signal)
  return drive.click(step.role, step.label, signal)
}

export function createDemoEngine(options: DemoEngineOptions): DemoEngine {
  const location = {directory: DIRECTORY}
  const events = createEvents(DIRECTORY)
  const publish = (type: string, data: Record<string, unknown>): void => {
    options.rpc.forEach((provider) => provider.observe?.(type, data))
    events.publish(type, data)
  }
  const hold = createHold()
  const pace = createPace(options.reducedMotion, hold)
  const drive = createDrive(events.publish)
  const labels = options.script.labels ?? PLAYGROUND_LABELS
  const store = createSessions(labels.session)
  const chat = createChat({
    pace,
    drive,
    publish,
    editPage: options.editPage,
    saveMessage: store.saveMessage,
    setRunning: store.setRunning,
  })
  const finished = chat.script(options.script.turns)
  const bundle = (id: string): DemoBundle => options.bundles.find((known) => known.id === id) ?? pluginNotFound(id)
  const handlers: EngineHandlers = {
    auth: {
      trust: () => ({trusted: true}),
      requestCode: () => ({expiresAt: Date.now() + 60_000}),
      exchange: () => ({refused: 'expired'}),
    },
    sessions: store.handlers,
    tabs: createTabs((sessionId) => store.history.has(sessionId), events.publish),
    settings: createSettings(),
    drafts: store.drafts,
    markers: {list: () => []},
    chat: {
      events: ({sessionId}, call) => chat.events(sessionId, call.signal),
      send: ({sessionId, runId, messages}, call) => {
        const sent = lastUserMessage(messages)
        if (sent !== undefined)
          store.saveMessage(sessionId, {id: sent.id, role: 'user', parts: [{type: 'text', content: sent.text}]})
        store.touch()
        return chat.send(sessionId, runId, sent?.text ?? '', call.signal)
      },
      join: ({runId}, call) => chat.join(runId, call.signal),
      hydrate: ({sessionId, before}) => ({
        messages: before === undefined ? [...(store.history.get(sessionId) ?? [])] : [],
        ...(before === undefined ? {} : {page: {truncated: false}}),
        messageHarness: {},
        ...chat.hydrateRun(sessionId),
      }),
      stop: ({runIds}) => chat.stop(runIds),
      permissionDecision: ({approvalId, reply}) => chat.decide(approvalId, reply),
    },
    registry: {catalog: () => []},
    meta: {
      models: () => ({
        models: [{id: 'playground', name: labels.model}],
        defaultModel: 'playground',
        modelsFailed: false,
        harness: {id: HARNESS_ID, name: labels.session, imageInput: false, persistentPty: false},
        login: {loggedIn: true},
      }),
      harnesses: () => ({
        harnesses: [
          {
            id: HARNESS_ID,
            name: labels.session,
            imageInput: false,
            persistentPty: false,
            models: [{id: 'playground', name: labels.model}],
            defaultModel: 'playground',
            modelsFailed: false,
            login: {loggedIn: true},
          },
        ],
        defaultHarness: HARNESS_ID,
      }),
      commands: () => ({commands: []}),
      tools: () => ({tools: []}),
      project: () => ({name: 'vite-project', root: DIRECTORY, branch: null, instructions: null}),
      engine: () => ({stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'playground'}),
      hubAgents: async function* (_input, call) {
        yield {installs: [], connections: []}
        await aborted(call.signal)
      },
    },
    skill: {list: () => ({location, data: []})},
    agent: {list: () => ({location, data: []})},
    fs: {find: () => ({location, data: []})},
    plugin: {
      invoke: ({rpcId, method, input}) => {
        if (rpcId === WidgetDrive.id && method === 'result') return drive.answer(input)
        const handler = options.rpc.find((known) => known.id === rpcId)?.methods[method]
        if (handler === undefined) return rpcFailed(`the playground does not answer ${rpcId}.${method}`)
        return handler(input)
      },
      list: () => ({
        location,
        data: [
          ...options.serverBuiltins.map((id) => ({
            id,
            source: {type: 'builtin' as const},
            features: {server: true as const, rpc: true as const},
            state: {status: 'active' as const},
          })),
          ...options.bundles.map((served) => ({
            id: served.id,
            source: {type: 'package' as const, target: served.id},
            features: {server: true as const, rpc: true as const, experimental: true as const},
            state: {status: 'active' as const},
          })),
        ],
      }),
      experimental: ({id}) => {
        const served = bundle(id)
        return {
          location,
          data: {file: served.file, code: served.code, revision: `${id}-playground`, options: {}, chunks: []},
        }
      },
      experimentalChunk: ({id, file}) => {
        bundle(id)
        throw new ORPCError('PLUGIN_CHUNK_NOT_FOUND', {
          message: "no such chunk in the plugin's current build",
          data: {pluginId: id, file},
        })
      },
    },
    event: {subscribe: (input, call) => events.subscribe(input?.types, call.signal)},
  }
  const performSteps = async (steps: readonly UiStep[] | undefined, signal: AbortSignal): Promise<void> => {
    for (const step of steps ?? []) {
      await pace.beat(signal)
      if (signal.aborted) return
      await performStep(drive, step, signal)
    }
  }
  const waitFor = (turnFinished: Promise<void> | undefined, signal: AbortSignal): Promise<void> =>
    turnFinished === undefined ? Promise.resolve() : Promise.race([turnFinished, aborted(signal)])
  const playTurn = async (turn: Turn, index: number, signal: AbortSignal): Promise<void> => {
    await performSteps(turn.before, signal)
    if (turn.queued !== true) await waitFor(finished[index - 1], signal)
    if (signal.aborted) return
    options.onProgress({turn: index + 1, turns: options.script.turns.length, ended: false})
    await pace.beat(signal)
    if (signal.aborted) return
    await drive.send(turn.prompt, signal)
    if (turn.after !== undefined) await waitFor(finished[index], signal)
    await performSteps(turn.after, signal)
  }
  const play = async (signal: AbortSignal): Promise<void> => {
    const {turns} = options.script
    options.onProgress({turn: 1, turns: turns.length, ended: false})
    for (const [index, turn] of turns.entries()) await playTurn(turn, index, signal)
    await waitFor(finished.at(-1), signal)
    if (!signal.aborted) options.onProgress({turn: turns.length, turns: turns.length, ended: true})
  }
  return {
    apiBase: 'https://playground.conciv.invalid',
    connection: demoConnection(buildRouter(contract, handlers), options.version),
    play,
    hold: hold.hold,
    resume: hold.resume,
    dispose: chat.dispose,
  }
}
