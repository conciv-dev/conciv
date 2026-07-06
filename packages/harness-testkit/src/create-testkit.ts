import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serve, type Server} from 'srvx'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {StreamChunk} from '@tanstack/ai'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
import {resolveSession} from './session.js'
import type {TestHarness} from './create-test-harness.js'

function realSpawn(bin: string): (args: string[], cwd: string) => HarnessChild {
  return (args, cwd) => {
    const child = spawn(bin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${bin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }
}

function neverSpawn(): HarnessChild {
  throw new Error('createTestkit: a scripted harness must not spawn a process')
}

function isTestHarness(harness: HarnessAdapter): harness is TestHarness {
  return '__scripted' in harness
}

async function* parseSse(response: Response, signal: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const {value, done} = await reader.read()
    if (done) return
    buffer += decoder.decode(value, {stream: true})
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (json) yield JSON.parse(json)
    }
  }
}

export type BootEnv = {
  stateRoot: string
  cwd: string
  harness: HarnessAdapter
  spawnHarness: (args: string[], cwd: string, sessionId?: string) => HarnessChild
}
export type BootedApp = {
  fetch: (request: Request) => Response | Promise<Response>
  dispose: () => Promise<void>
}
export type BootApp = (env: BootEnv) => Promise<BootedApp>

export type ChatMessage = Record<string, unknown>

export type Kit = {
  base: string
  stateRoot: string
  session: (id?: string) => Promise<string>
  attach: (session?: string, opts?: {signal?: AbortSignal}) => Promise<RunStream>
  chat: (input: string | ChatMessage, session?: string) => Promise<void>
  post: (path: string, body: unknown, session?: string) => Promise<Response>
  get: (path: string, session?: string) => Promise<Response>
  invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<void>
  callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
  cleanup: () => Promise<void>
}
export type Testkit = {setup: () => Promise<Kit>}

export function createTestkit(harness: HarnessAdapter, boot: BootApp): Testkit {
  return {
    setup: async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const spawnHarness = isTestHarness(harness) ? neverSpawn : realSpawn(harness.binName)
      const app = await boot({stateRoot, cwd: stateRoot, harness, spawnHarness})
      const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
      await server.ready()
      const base = new URL(server.url ?? '').origin
      const aborts: AbortController[] = []

      const post = (path: string, body: unknown, session?: string): Promise<Response> =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', ...(session ? {[CONCIV_SESSION_HEADER]: session} : {})},
          body: JSON.stringify(body),
        })
      const resolve = (id?: string): Promise<string> => resolveSession(base, id)
      const activeSession = {id: ''}
      const sessionFor = async (session?: string): Promise<string> => session ?? (activeSession.id ||= await resolve())

      const callTool = async (name: string, input: unknown, session?: string): Promise<unknown> =>
        makeCallTool(base, await sessionFor(session))(name, input)

      const toMessage = (input: string | ChatMessage): ChatMessage =>
        typeof input === 'string' ? {id: 'm', role: 'user', parts: [{type: 'text', content: input}]} : input

      const sendChat = async (input: string | ChatMessage, session: string): Promise<void> => {
        const response = await post('/api/chat', {messages: [toMessage(input)]}, session)
        if (!response.ok) throw new Error(`chat: POST /api/chat ${response.status} - ${await response.text()}`)
      }

      return {
        base,
        stateRoot,
        session: (id) => resolve(id),
        attach: async (session, opts) => {
          const abort = new AbortController()
          aborts.push(abort)
          const signal = opts?.signal ? AbortSignal.any([abort.signal, opts.signal]) : abort.signal
          const id = await sessionFor(session)
          const response = await fetch(`${base}/api/chat/attach`, {
            headers: {[CONCIV_SESSION_HEADER]: id},
            signal,
          })
          return makeRunStream(parseSse(response, signal))
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
            harness.__scripted.hold()
            await sendChat('go', id)
            await callTool(name, input, id)
            harness.__scripted.release()
          } else {
            await sendChat(opts.instruction, id)
          }
        },
        callTool,
        cleanup: async () => {
          for (const abort of aborts) abort.abort()
          await app.dispose()
          await server.close()
          rmSync(stateRoot, {recursive: true, force: true})
        },
      }
    },
  }
}
