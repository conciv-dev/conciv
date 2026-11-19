import {randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serveApp} from './serve-app.js'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatContentPartSchema, type ChatContentPart} from '@conciv/protocol/chat-types'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
import {makeBrowserRpcClient} from '@conciv/contract'
import type {RpcClient} from './session.js'
import {rpcStream} from '@conciv/ai/client'
import type {ChatMessage as ProtocolChatMessage} from '@conciv/protocol/chat-message-types'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'

type TurnMessage = {role: 'user'; parts: ProtocolChatMessage['parts']}

type ChatTurns = {
  turn: (input: {sessionId: string; runId: string; messageId?: string; message: TurnMessage}) => RunStream
  join: (runId: string) => RunStream
  closeAll: () => void
}

async function* streamed(opened: Promise<AsyncIterable<ChatEvent>>): AsyncGenerator<ChatEvent> {
  yield* await opened
}

function makeChatTurns(rpc: RpcClient): ChatTurns {
  const open: AbortController[] = []
  const opened = (): AbortController => {
    const abort = new AbortController()
    open.push(abort)
    return abort
  }
  const turns = rpcStream((_messages, _data, signal, input) =>
    streamed(rpc.chat.send({sessionId: input.threadId, runId: input.runId, messages: input.messages}, {signal})),
  )
  return {
    turn: ({sessionId, runId, messageId, message}) =>
      makeRunStream(
        turns.connect([{id: messageId ?? `${runId}-user`, ...message}], {}, opened().signal, {
          threadId: sessionId,
          runId,
        }),
      ),
    join: (runId) => makeRunStream(streamed(rpc.chat.join({runId}, {signal: opened().signal}))),
    closeAll: () => {
      for (const abort of open.splice(0)) abort.abort()
    },
  }
}

export type BootEnv = {
  stateRoot: string
  cwd: string
  harness: HarnessAdapter
  print: (text: string) => void
}
export type BootedApp = {
  fetch: (request: Request) => Response | Promise<Response>
  dispose: () => Promise<void>
  agentToken: string
}
export type BootApp = (env: BootEnv) => Promise<BootedApp>

export type ChatMessage = Record<string, unknown>

export type Kit = {
  base: string
  wsBase: string
  origin: string
  token: string
  terminal: () => string
  stateRoot: string
  rpc: RpcClient
  session: (id?: string) => Promise<string>
  turn: (
    input: string | ChatMessage,
    opts?: {session?: string; runId?: string; messageId?: string},
  ) => Promise<RunStream>
  join: (runId: string) => RunStream
  hydrate: (session?: string) => Promise<Awaited<ReturnType<RpcClient['chat']['hydrate']>>>
  events: (session?: string, opts?: {signal?: AbortSignal}) => Promise<RunStream>
  chat: (input: string | ChatMessage, session?: string) => Promise<RunStream>
  callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
  restartServer: () => Promise<void>
  cleanup: () => Promise<void>
}
export type Testkit = {setup: () => Promise<Kit>}

export type TestkitOptions = {stateRoot?: string}

function isTextPart(part: unknown): part is {type: 'text'; content: string} {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'content' in part &&
    typeof part.content === 'string'
  )
}

function userMessage(input: string | ChatMessage): TurnMessage {
  if (typeof input === 'string') return {role: 'user', parts: [{type: 'text', content: input}]}
  const parsed = ChatContentPartSchema.array().safeParse(input.content)
  if (!parsed.success) return {role: 'user', parts: [{type: 'text', content: readText(input)}]}
  return {role: 'user', parts: parsed.data.map(contentPart)}
}

function contentPart(part: ChatContentPart): TurnMessage['parts'][number] {
  if (part.type === 'text') return {type: 'text', content: part.content}
  if (part.type === 'image') return {type: 'image', source: part.source}
  return {type: 'document', source: part.source}
}

function readText(input: string | ChatMessage): string {
  if (typeof input === 'string') return input
  const parts = input.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (isTextPart(part) ? part.content : ''))
    .filter((text) => text !== '')
    .join('\n')
}

type Release = () => unknown

async function settleInOrder(steps: Release[]): Promise<unknown[]> {
  return steps.reduce<Promise<unknown[]>>(async (pending, step) => {
    const failures = await pending
    const [outcome] = await Promise.allSettled([Promise.resolve().then(step)])
    return outcome?.status === 'rejected' ? [...failures, outcome.reason] : failures
  }, Promise.resolve([]))
}

async function abandonSetup(error: unknown, steps: Release[]): Promise<never> {
  const failures = await settleInOrder(steps)
  if (failures.length === 0) throw error
  throw new AggregateError([error, ...failures], 'testkit setup failed')
}

export function createTestkit(harness: HarnessAdapter, boot: BootApp, options: TestkitOptions = {}): Testkit {
  const ownsStateRoot = options.stateRoot === undefined
  return {
    setup: async () => {
      const stateRoot = options.stateRoot ?? mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const removeOwnedRoot = (): Promise<void> | undefined =>
        ownsStateRoot ? rm(stateRoot, {recursive: true, force: true, maxRetries: 10, retryDelay: 50}) : undefined
      const printed: string[] = []
      const terminal = (): string => printed.join('\n')
      const app = await boot({stateRoot, cwd: stateRoot, harness, print: (text) => printed.push(text)}).catch(
        (error: unknown) => abandonSetup(error, [removeOwnedRoot]),
      )
      let served = await serveApp(app.fetch).catch((error: unknown) =>
        abandonSetup(error, [() => app.dispose(), removeOwnedRoot]),
      )
      const token = app.agentToken
      const base = `${served.base}/t/${token}`
      const wsBase = `${served.wsBase}/t/${token}`
      const aborts: AbortController[] = []
      const activeSession = {id: ''}
      const browser = makeBrowserRpcClient(base, {session: () => activeSession.id || null})
      const {rpc} = browser

      const resolve = async (id?: string): Promise<string> => (await rpc.sessions.resolve(id ? {id} : {})).sessionId
      activeSession.id = await resolve().catch((error: unknown) =>
        abandonSetup(error, [() => browser.close(), () => served.close(), () => app.dispose(), removeOwnedRoot]),
      )
      const sessionFor = async (session?: string): Promise<string> => session ?? activeSession.id

      const callTool = async (name: string, input: unknown, session?: string): Promise<unknown> =>
        makeCallTool(base, await sessionFor(session))(name, input)

      const sockets = makeChatTurns(rpc)
      const startTurn = async (
        input: string | ChatMessage,
        opts: {session?: string; runId?: string; messageId?: string} = {},
      ): Promise<RunStream> => {
        const sessionId = await sessionFor(opts.session)
        return sockets.turn({
          sessionId,
          runId: opts.runId ?? randomUUID(),
          ...(opts.messageId === undefined ? {} : {messageId: opts.messageId}),
          message: userMessage(input),
        })
      }

      return {
        base,
        wsBase,
        origin: served.base,
        token,
        terminal,
        stateRoot,
        rpc,
        session: (id) => (id ? resolve(id) : Promise.resolve(activeSession.id)),
        turn: startTurn,
        join: (runId) => sockets.join(runId),
        hydrate: async (session) => rpc.chat.hydrate({sessionId: await sessionFor(session)}),
        events: async (session, opts) => {
          const abort = new AbortController()
          aborts.push(abort)
          const signal = opts?.signal ? AbortSignal.any([abort.signal, opts.signal]) : abort.signal
          const id = await sessionFor(session)
          return makeRunStream(await rpc.chat.events({sessionId: id}, {signal}))
        },
        chat: (input, session) => startTurn(input, {session}),
        callTool,
        restartServer: async () => {
          await served.close()
          served = await serveApp(app.fetch, {port: served.port})
        },
        cleanup: async () => {
          sockets.closeAll()
          for (const abort of aborts) abort.abort()
          browser.close()
          const failures = await settleInOrder([() => served.close(), () => app.dispose(), removeOwnedRoot])
          if (failures.length > 0) throw new AggregateError(failures, 'testkit cleanup failed')
        },
      }
    },
  }
}
