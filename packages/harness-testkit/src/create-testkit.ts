import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import pTimeout from 'p-timeout'
import {serveApp} from './serve-app.js'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {ChatContentPartSchema, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
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
}
export type BootApp = (env: BootEnv) => Promise<BootedApp>

export type ChatMessage = Record<string, unknown>

export type Kit = {
  base: string
  wsBase: string
  stateRoot: string
  rpc: RpcClient
  session: (id?: string) => Promise<string>
  attach: (session?: string, opts?: {signal?: AbortSignal}) => Promise<RunStream>
  chat: (input: string | ChatMessage, session?: string) => Promise<void>
  post: (path: string, body: unknown, session?: string) => Promise<Response>
  get: (path: string, session?: string) => Promise<Response>
  invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<void>
  callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
  restartServer: () => Promise<void>
  cleanup: () => Promise<void>
}
export type Testkit = {setup: () => Promise<Kit>}

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

function textOf(input: string | ChatMessage): string {
  if (typeof input === 'string') return input
  const parts = input.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (isTextPart(part) ? part.content : ''))
    .filter((text) => text !== '')
    .join('\n')
}

export function createTestkit(harness: HarnessAdapter, boot: BootApp): Testkit {
  return {
    setup: async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const app = await boot({stateRoot, cwd: stateRoot, harness})
      let served = await serveApp(app.fetch)
      const base = served.base
      const wsBase = served.wsBase
      const aborts: AbortController[] = []
      const activeSession = {id: ''}
      const rpc = makeSessionBoundRpcClient(base, () => activeSession.id)
      const bootstrapRpc = makeRpcClient(base)

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

      const sendChat = async (input: string | ChatMessage, session: string): Promise<void> => {
        const runId = randomUUID()
        if (typeof input === 'string') {
          await rpc.chat.send({sessionId: session, runId, text: input})
          return
        }
        const content = ChatContentPartSchema.array().safeParse(input.content)
        await rpc.chat.send(
          content.success
            ? {sessionId: session, runId, content: content.data}
            : {sessionId: session, runId, text: textOf(input)},
        )
      }

      return {
        base,
        wsBase,
        stateRoot,
        rpc,
        session: (id) => (id ? resolve(id) : Promise.resolve(activeSession.id)),
        attach: async (session, opts) => {
          const abort = new AbortController()
          aborts.push(abort)
          const signal = opts?.signal ? AbortSignal.any([abort.signal, opts.signal]) : abort.signal
          const id = await sessionFor(session)
          const iterator = await rpc.chat.subscribe({sessionId: id}, {signal})
          return makeRunStream(iterator)
        },
        chat: async (input, session) => {
          await sendChat(input, await sessionFor(session))
        },
        post,
        get: async (path, session) =>
          fetch(`${base}${path}`, {headers: {[CONCIV_SESSION_HEADER]: session ?? activeSession.id}}),
        invokeTool: async (name, input, opts, session) => {
          const id = await sessionFor(session)
          if (isTestHarness(harness)) {
            harness.script.hold()
            await sendChat('go', id)
            await callTool(name, input, id)
            harness.script.release()
          } else {
            await sendChat(opts.instruction, id)
          }
        },
        callTool,
        restartServer: async () => {
          await served.close()
          served = await serveApp(app.fetch, {port: served.port})
        },
        cleanup: async () => {
          for (const abort of aborts) abort.abort()
          const stopLiveSessions = async () => {
            const sessions = (await rpc.sessions.list({includeHidden: true}).catch(() => [])) ?? []
            const runningSessions = sessions.filter((meta) => meta.running)
            await Promise.all(runningSessions.map((meta) => rpc.chat.stop({sessionId: meta.id}).catch(() => {})))
          }
          await pTimeout(stopLiveSessions(), {milliseconds: 3_000, fallback: () => undefined})
          await app.dispose()
          await served.close()
          rmSync(stateRoot, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
        },
      }
    },
  }
}
