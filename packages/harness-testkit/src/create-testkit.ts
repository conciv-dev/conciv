import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serveApp} from './serve-app.js'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {ChatContentPartSchema, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
import {withDeadline} from './deadline.js'
import {makeRpcClient, type RpcClient} from './session.js'
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

export type TestkitOptions = {bootTimeoutMs?: number}

const DEFAULT_BOOT_TIMEOUT_MS = 15_000

function bootTimeoutMessage(stage: string, timeoutMs: number): string {
  return `the testkit gave up after ${timeoutMs}ms at ${stage}; the app under test never got that far`
}

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

export function createTestkit(harness: HarnessAdapter, boot: BootApp, options: TestkitOptions = {}): Testkit {
  const bootTimeoutMs = options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS
  return {
    setup: async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const removeStateRoot = (): void =>
        rmSync(stateRoot, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
      const app = await withDeadline(
        bootTimeoutMs,
        bootTimeoutMessage('boot', bootTimeoutMs),
        () => boot({stateRoot, cwd: stateRoot, harness}),
        (late) => late.dispose().finally(removeStateRoot),
      ).catch((error: unknown) => {
        removeStateRoot()
        throw error
      })
      let served = await withDeadline(
        bootTimeoutMs,
        bootTimeoutMessage('serve', bootTimeoutMs),
        () => serveApp(app.fetch),
        (late) => late.close(),
      ).catch((error: unknown) => {
        void app.dispose().catch(() => {})
        removeStateRoot()
        throw error
      })
      const base = served.base
      const wsBase = served.wsBase
      const aborts: AbortController[] = []
      const rpc = makeRpcClient(base)

      const post = (path: string, body: unknown, session?: string): Promise<Response> =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', ...(session ? {[CONCIV_SESSION_HEADER]: session} : {})},
          body: JSON.stringify(body),
        })
      const resolve = async (id?: string): Promise<string> => {
        const resolved = await withDeadline(
          bootTimeoutMs,
          bootTimeoutMessage('resolving a session id', bootTimeoutMs),
          () => rpc.sessions.resolve(id ? {id} : {}),
        )
        return resolved.sessionId
      }
      const activeSession = {id: ''}
      const sessionFor = async (session?: string): Promise<string> => session ?? (activeSession.id ||= await resolve())

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
        session: (id) => resolve(id),
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
          fetch(`${base}${path}`, {headers: session ? {[CONCIV_SESSION_HEADER]: session} : {}}),
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
          await app.dispose()
          await served.close()
          removeStateRoot()
        },
      }
    },
  }
}
