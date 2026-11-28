import {createORPCClient, type ClientLink} from '@orpc/client'
import {z} from 'zod'
import {WidgetDrive} from '@conciv/protocol/simulation'
import type {EngineClient, EngineConnection, RpcClientContext} from '@conciv/client'
import {
  createFakeEngine,
  FakeLLM,
  type FakeBundle,
  type FakeHarness,
  type FakePluginHandler,
  type FakeReply,
  type FakeTool,
} from '@internal/test-utils'
import {
  PLAYGROUND_LABELS,
  type Ask,
  type PageEdit,
  type PlaygroundLabels,
  type PlaygroundProgress,
  type PlaygroundScript,
  type PluginEvent,
  type Reply,
  type ToolReply,
  type Turn,
  type UiStep,
} from '../src/playground/script'
import {createDrive, type Drive} from './widget-drive'
import {aborted, createHold, createPace, type Pace} from './pace'

export type PlaygroundRpc = {
  readonly id: string
  readonly methods: Readonly<Record<string, FakePluginHandler>>
  readonly observe?: (type: string, data: Readonly<Record<string, unknown>>) => void
}

export type PlaygroundEngineOptions = {
  readonly script: PlaygroundScript
  readonly reducedMotion: boolean
  readonly editPage: (edit: PageEdit) => void
  readonly onProgress: (progress: PlaygroundProgress) => void
  readonly bundles: readonly FakeBundle[]
  readonly rpc: readonly PlaygroundRpc[]
  readonly version: string
  readonly widgetRoot: Node
  readonly driveStarted: Promise<void>
}

export type PlaygroundEngine = {
  readonly apiBase: string
  readonly connection: EngineConnection
  readonly play: () => Promise<void>
  readonly hold: () => void
  readonly resume: () => void
  readonly setSpeed: (speed: number) => void
  readonly dispose: () => void
}

type Step = {
  readonly reply: FakeReply
  readonly answer?: Ask['answer']
  readonly settle?: () => Promise<unknown>
}

const HARNESS_ID = 'playground'

const TOKENS_PER_SECOND = 54

const GRABBED = 'Open grabbed element'

const UNSCRIPTED: Turn = {
  prompt: '',
  replies: [
    {
      kind: 'text',
      text: 'This demo plays a fixed script, so it cannot answer that or run tools. To ask an agent anything about your own app, add conciv to it: [Getting started](/docs/getting-started).',
    },
  ],
}

const SentMessage = z.looseObject({
  role: z.string(),
  content: z.unknown(),
  metadata: z.looseObject({displayText: z.string().optional()}).optional(),
})

const SendInput = z.looseObject({runId: z.string(), messages: z.array(z.unknown())})

const SubscribeInput = z.looseObject({types: z.array(z.string()).optional()}).optional()

const TextPart = z.looseObject({type: z.literal('text'), text: z.string().optional(), content: z.string().optional()})

const Stream = z.custom<AsyncIterable<unknown>>(
  (value) => typeof value === 'object' && value !== null && Symbol.asyncIterator in value,
)

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

function typedPrompt(messages: readonly unknown[]): string {
  const user = messages
    .flatMap((message) => {
      const parsed = SentMessage.safeParse(message)
      return parsed.success && parsed.data.role === 'user' ? [parsed.data] : []
    })
    .at(-1)
  if (user === undefined) return ''
  return user.metadata?.displayText?.trim() ?? contentText(user.content).trim()
}

function callId(): string {
  return `call_${crypto.randomUUID().replaceAll('-', '')}`
}

function harness(labels: PlaygroundLabels): FakeHarness {
  return {
    models: [{id: 'playground', name: labels.model}],
    defaultModel: 'playground',
    modelsFailed: false,
    harness: {id: HARNESS_ID, name: labels.session, imageInput: false, persistentPty: false},
    login: {loggedIn: true},
  }
}

function scriptTools(script: PlaygroundScript, run: () => unknown): Record<string, FakeTool> {
  const replies = script.turns
    .flatMap((turn) => turn.replies)
    .flatMap((reply) => (reply.kind === 'tool' ? [reply] : []))
  return Object.fromEntries(
    [...new Set(replies.map((reply) => reply.name))].map((name) => {
      const ask = replies.find((reply) => reply.name === name && reply.ask !== undefined)?.ask
      const code = replies.some((reply) => reply.name === name && reply.mode === 'code')
      const tool: FakeTool = {
        ...(ask === undefined ? {} : {ask: {title: ask.title, always: ask.always ?? false}}),
        ...(code ? {run} : {}),
      }
      return [name, tool]
    }),
  )
}

async function* announce(stream: AsyncIterable<unknown>, ready: () => void): AsyncGenerator<unknown> {
  for await (const event of stream) {
    ready()
    yield event
  }
}

async function drain(stream: AsyncIterator<unknown>): Promise<void> {
  const next = await stream.next()
  if (next.done !== true) return drain(stream)
}

function sharedEvents(input: unknown, output: unknown, ready: () => void): unknown {
  const subscribe = SubscribeInput.safeParse(input)
  const stream = Stream.safeParse(output)
  if (!subscribe.success || subscribe.data?.types !== undefined || !stream.success) return output
  return announce(stream.data, ready)
}

async function performStep(drive: Drive, pace: Pace, step: UiStep, signal: AbortSignal): Promise<void> {
  if (step.kind === 'click') return drive.click(step.role, step.label, signal)
  drive.hover(step.role, step.label)
  await pace.beat(signal)
  if (signal.aborted) return
  drive.press(step.role, step.label)
  await drive.shown('button', GRABBED, signal)
}

export function createPlaygroundEngine(options: PlaygroundEngineOptions): PlaygroundEngine {
  const director = new AbortController()
  const {signal} = director
  const {turns} = options.script
  const labels = options.script.labels ?? PLAYGROUND_LABELS
  const hold = createHold()
  const pace = createPace(options.reducedMotion, hold)
  const sharedStream = Promise.withResolvers<void>()
  const drive = createDrive(
    (type, data) => engine.emit(type, data),
    options.widgetRoot,
    Promise.all([options.driveStarted, sharedStream.promise]),
  )
  const state: {steps: Step[]; current: Step | undefined; gated: boolean; run: AbortSignal} = {
    steps: [],
    current: undefined,
    gated: false,
    run: signal,
  }
  const engine = createFakeEngine({
    sessions: [{id: `ses_${crypto.randomUUID().replaceAll('-', '')}`, title: labels.session}],
    harnesses: [harness(labels)],
    bundles: options.bundles,
    plugins: Object.fromEntries([
      ...options.rpc.map((provider) => [provider.id, provider.methods] as const),
      [WidgetDrive.id, {result: (input: unknown) => drive.answer(input)}],
    ]),
    tools: scriptTools(options.script, () => state.current?.settle?.() ?? {}),
    ...(options.reducedMotion ? {} : {tokensPerSecond: TOKENS_PER_SECOND}),
    handlers: {
      meta: {project: () => ({name: 'vite-project', root: engine.directory, branch: null, instructions: null})},
    },
  })
  engine.version(options.version)
  const client = createORPCClient<EngineClient>(engine.connection.link)
  const publish = (event: PluginEvent): void => {
    options.rpc.forEach((provider) => provider.observe?.(event.type, event.data))
    engine.emit(event.type, {...event.data})
  }
  const settle = (reply: ToolReply) => async (): Promise<unknown> => {
    for (const event of reply.events ?? []) {
      await pace.beat(signal)
      publish(event)
    }
    await pace.beat(signal)
    if (reply.page !== undefined) options.editPage(reply.page)
    return reply.result
  }
  const toolStep = (reply: ToolReply): Step => {
    const answer = reply.ask === undefined ? {} : {answer: reply.ask.answer}
    if (reply.mode === 'code')
      return {reply: FakeLLM.execute(callId(), reply.name, reply.input), settle: settle(reply), ...answer}
    const called: FakeReply = {
      kind: 'toolCall',
      id: callId(),
      name: reply.name,
      input: reply.input,
      result: settle(reply),
      failed: reply.failed === true,
    }
    return {reply: called, ...answer}
  }
  const step = (reply: Reply, last: boolean): Step => {
    if (reply.kind === 'tool') return toolStep(reply)
    if (reply.kind === 'thinking') return {reply: FakeLLM.thinking(reply.text)}
    return {reply: last ? FakeLLM.text(reply.text) : FakeLLM.partialText(reply.text)}
  }
  const steps = (turn: Turn): Step[] =>
    turn.replies.map((reply, index) => step(reply, index === turn.replies.length - 1))
  const answer = (label: Ask['answer'], run: AbortSignal): void => {
    pace
      .beat(run)
      .then(() => drive.click('button', label, run))
      .catch((error: unknown) => {
        if (!run.aborted) console.error('[playground] the scripted answer could not be clicked', error)
      })
  }
  const arm = (): void => {
    if (state.gated) return
    state.gated = true
    const gate = engine.gate()
    void gate.started.then(async () => {
      state.gated = false
      await pace.beat(signal)
      if (signal.aborted) return
      const next = state.steps.shift() ?? steps(UNSCRIPTED)[0]
      if (next === undefined) return
      state.current = next
      engine.reply(next.reply)
      if (state.steps.length > 0) arm()
      gate.release()
      if (next.answer !== undefined) answer(next.answer, state.run)
    })
  }
  const finished = turns.map(() => Promise.withResolvers<void>())
  const unplayed = turns.map((_, index) => index)
  const begin = (input: unknown): {readonly runId: string; readonly done: () => void} | undefined => {
    const sent = SendInput.safeParse(input)
    if (!sent.success) return undefined
    const prompt = typedPrompt(sent.data.messages)
    const position = unplayed.findIndex((index) => turns[index]?.prompt === prompt)
    const index = position < 0 ? undefined : unplayed.splice(position, 1)[0]
    const turn = index === undefined ? undefined : turns[index]
    const run = new AbortController()
    state.run = AbortSignal.any([signal, run.signal])
    state.steps = steps(turn ?? UNSCRIPTED)
    arm()
    return {
      runId: sent.data.runId,
      done: () => {
        run.abort()
        if (index !== undefined) finished[index]?.resolve()
      },
    }
  }
  const follow = (run: {readonly runId: string; readonly done: () => void}): void => {
    client.chat
      .join({runId: run.runId}, {signal})
      .then((events) => drain(events[Symbol.asyncIterator]()))
      .catch((error: unknown) => {
        if (!signal.aborted) console.error('[playground] the scripted run could not be followed', error)
      })
      .finally(run.done)
  }
  const link: ClientLink<RpcClientContext> = {
    call: async (path, input, callOptions) => {
      const route = path.join('.')
      const run = route === 'chat.send' ? begin(input) : undefined
      const output = await engine.connection.link.call(path, input, callOptions)
      if (run !== undefined) follow(run)
      return route === 'event.subscribe' ? sharedEvents(input, output, sharedStream.resolve) : output
    },
  }
  const performSteps = async (uiSteps: readonly UiStep[] | undefined): Promise<void> => {
    for (const uiStep of uiSteps ?? []) {
      await pace.beat(signal)
      if (signal.aborted) return
      await performStep(drive, pace, uiStep, signal)
    }
  }
  const waitFor = (turnFinished: Promise<void> | undefined): Promise<void> =>
    turnFinished === undefined ? Promise.resolve() : Promise.race([turnFinished, aborted(signal)])
  const playTurn = async (turn: Turn, index: number): Promise<void> => {
    await performSteps(turn.before)
    if (turn.queued !== true) await waitFor(finished[index - 1]?.promise)
    if (signal.aborted) return
    options.onProgress({turn: index + 1, turns: turns.length, ended: false})
    await pace.beat(signal)
    if (signal.aborted) return
    await drive.send(turn.prompt, signal)
    if (turn.after !== undefined) await waitFor(finished[index]?.promise)
    await performSteps(turn.after)
  }
  const playTurns = async (): Promise<void> => {
    options.onProgress({turn: 1, turns: turns.length, ended: false})
    for (const [index, turn] of turns.entries()) await playTurn(turn, index)
    await waitFor(finished.at(-1)?.promise)
    if (!signal.aborted) options.onProgress({turn: turns.length, turns: turns.length, ended: true})
  }
  const play = (): Promise<void> =>
    playTurns().catch((error: unknown) => {
      if (!signal.aborted) throw error
    })
  return {
    apiBase: engine.apiBase,
    connection: {...engine.connection, link},
    play,
    hold: hold.hold,
    resume: hold.resume,
    setSpeed: pace.setSpeed,
    dispose: () => {
      director.abort()
      engine.dispose()
    },
  }
}
