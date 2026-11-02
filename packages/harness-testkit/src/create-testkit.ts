import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import pTimeout from 'p-timeout'
import {nodeClient, type NodeClient} from '@conciv/extension/devframe-connection'
import type {ClaimUpgrade} from '@conciv/serve'
import type {HubInstance} from '@devframes/hub/initiate'
import {serveApp} from './serve-app.js'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatContentPartSchema, CONCIV_SESSION_HEADER, type ChatContentPart} from '@conciv/protocol/chat-types'
import {makeChatSockets, type TurnMessage} from './chat-turn.js'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
import {makeRpcClient, makeSessionBoundRpcClient, type RpcClient} from './session.js'
import type {TestHarness} from './create-test-harness.js'

function isTestHarness(harness: HarnessAdapter): harness is TestHarness {
  return 'script' in harness
}

export type BootEnv = {
  stateRoot: string
  cwd: string
  harness: HarnessAdapter
}
export type BootedApp = {
  fetch: (request: Request) => Response | Promise<Response>
  dispose: () => Promise<void>
  hub: HubInstance
  claimUpgrade: ClaimUpgrade
  loginToken: string
}
export type BootApp = (env: BootEnv) => Promise<BootedApp>

export type ChatMessage = Record<string, unknown>

export type Kit = {
  base: string
  wsBase: string
  stateRoot: string
  rpc: RpcClient
  hub: NodeClient
  hubInstance: HubInstance
  hubUrl: string
  loginToken: string
  session: (id?: string) => Promise<string>
  turn: (
    input: string | ChatMessage,
    opts?: {session?: string; runId?: string; messageId?: string},
  ) => Promise<RunStream>
  join: (runId: string) => RunStream
  hydrate: (session?: string) => Promise<Awaited<ReturnType<RpcClient['chat']['hydrate']>>>
  events: (session?: string, opts?: {signal?: AbortSignal}) => Promise<RunStream>
  chat: (input: string | ChatMessage, session?: string) => Promise<RunStream>
  post: (path: string, body: unknown, session?: string) => Promise<Response>
  get: (path: string, session?: string) => Promise<Response>
  invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<RunStream>
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
  if (!parsed.success) return {role: 'user', parts: [{type: 'text', content: textOf(input)}]}
  return {role: 'user', parts: parsed.data.map(contentPart)}
}

function contentPart(part: ChatContentPart): TurnMessage['parts'][number] {
  if (part.type === 'text') return {type: 'text', content: part.content}
  if (part.type === 'image') return {type: 'image', source: part.source}
  return {type: 'document', source: part.source}
}

function textOf(input: string | ChatMessage): string {
  if (typeof input === 'string') return input
  const parts = input.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (isTextPart(part) ? part.content : ''))
    .filter((text) => text !== '')
    .join('\n')
}

export function createTestkit(harness: HarnessAdapter, boot: BootApp, options: TestkitOptions = {}): Testkit {
  const ownsStateRoot = options.stateRoot === undefined
  return {
    setup: async () => {
      const stateRoot = options.stateRoot ?? mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const app = await boot({stateRoot, cwd: stateRoot, harness})
      const listener = {fetch: app.fetch, claimUpgrade: app.claimUpgrade}
      let served = await serveApp(listener)
      const agentPath = `/t/${app.loginToken}`
      const base = `${served.base}${agentPath}`
      const wsBase = `${served.wsBase}${agentPath}`
      const aborts: AbortController[] = []
      const activeSession = {id: ''}
      const rpc = makeSessionBoundRpcClient(base, () => activeSession.id)
      const bootstrapRpc = makeRpcClient(base)
      const hubUrl = `${served.base}${app.hub.base}`
      const hub = nodeClient({url: hubUrl, transport: 'ws', token: app.loginToken})

      const post = (path: string, body: unknown, session?: string): Promise<Response> =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [CONCIV_SESSION_HEADER]: session ?? activeSession.id,
          },
          body: JSON.stringify(body),
        })
      const resolve = async (id?: string): Promise<string> =>
        (await bootstrapRpc.sessions.resolve(id ? {id} : {})).sessionId
      activeSession.id = await resolve()
      const sessionFor = async (session?: string): Promise<string> => session ?? activeSession.id

      const callTool = async (name: string, input: unknown, session?: string): Promise<unknown> =>
        makeCallTool(base, await sessionFor(session))(name, input)

      const sockets = makeChatSockets()
      const startTurn = async (
        input: string | ChatMessage,
        opts: {session?: string; runId?: string; messageId?: string} = {},
      ): Promise<RunStream> => {
        const sessionId = await sessionFor(opts.session)
        return sockets.turn({
          wsBase,
          sessionId,
          runId: opts.runId ?? randomUUID(),
          ...(opts.messageId === undefined ? {} : {messageId: opts.messageId}),
          message: userMessage(input),
        })
      }

      return {
        base,
        wsBase,
        stateRoot,
        rpc,
        hub,
        hubInstance: app.hub,
        hubUrl,
        loginToken: app.loginToken,
        session: (id) => (id ? resolve(id) : Promise.resolve(activeSession.id)),
        turn: startTurn,
        join: (runId) => sockets.join({wsBase, runId}),
        hydrate: async (session) => rpc.chat.hydrate({sessionId: await sessionFor(session)}),
        events: async (session, opts) => {
          const abort = new AbortController()
          aborts.push(abort)
          const signal = opts?.signal ? AbortSignal.any([abort.signal, opts.signal]) : abort.signal
          const id = await sessionFor(session)
          return makeRunStream(await rpc.chat.events({sessionId: id}, {signal}))
        },
        chat: (input, session) => startTurn(input, {session}),
        post,
        get: async (path, session) =>
          fetch(`${base}${path}`, {headers: {[CONCIV_SESSION_HEADER]: session ?? activeSession.id}}),
        invokeTool: async (name, input, opts, session) => {
          const id = await sessionFor(session)
          if (!isTestHarness(harness)) return startTurn(opts.instruction, {session: id})
          harness.script.hold()
          const stream = await startTurn('go', {session: id})
          await callTool(name, input, id)
          harness.script.release()
          return stream
        },
        callTool,
        restartServer: async () => {
          await served.close()
          served = await serveApp(listener, {port: served.port})
        },
        cleanup: async () => {
          sockets.closeAll()
          for (const abort of aborts) abort.abort()
          const stopLiveSessions = async () => {
            const sessions = (await rpc.sessions.list({includeHidden: true}).catch(() => [])) ?? []
            const runningSessions = sessions.filter((meta) => meta.running)
            const stopActiveRun = async (sessionId: string) => {
              const {activeRun} = await rpc.chat.hydrate({sessionId})
              await rpc.chat.stop({sessionId, runIds: activeRun ? [activeRun.runId] : []})
            }
            await Promise.all(runningSessions.map((meta) => stopActiveRun(meta.id).catch(() => {})))
          }
          await pTimeout(stopLiveSessions(), {milliseconds: 3_000, fallback: () => undefined})
          hub.close()
          await app.dispose()
          await served.close()
          if (ownsStateRoot) rmSync(stateRoot, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
        },
      }
    },
  }
}
