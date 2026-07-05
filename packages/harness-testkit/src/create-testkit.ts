import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serve, type Server} from 'srvx'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {StreamChunk} from '@tanstack/ai'
import {makeApp} from '@conciv/core/app'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
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

export type Kit = {
  base: string
  session: (id?: string) => Promise<string>
  attach: (session?: string) => Promise<RunStream>
  chat: (content: string, session?: string) => Promise<void>
  invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<void>
  callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
  cleanup: () => Promise<void>
}
export type Testkit = {setup: () => Promise<Kit>}

export function createTestkit(harness: HarnessAdapter): Testkit {
  return {
    setup: async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const spawnHarness = isTestHarness(harness) ? neverSpawn : realSpawn(harness.binName)
      const {app, disposers} = await makeApp({
        cfg: {
          enabled: true,
          widgetUrl: undefined,
          stateRoot,
          harness: harness.id,
          harnessBin: undefined,
          sessionId: '',
          systemPrompt: '',
          extensions: undefined,
        },
        cwd: stateRoot,
        openInEditor: () => {},
        spawnHarness,
        harness,
      })
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
      const resolve = async (id?: string): Promise<string> => {
        const res = await post('/api/chat/session/resolve', id ? {id} : {})
        const parsed: unknown = await res.json()
        if (typeof parsed !== 'object' || parsed === null || !('sessionId' in parsed)) {
          throw new Error('resolve: response had no sessionId')
        }
        const {sessionId} = parsed
        if (typeof sessionId !== 'string') throw new Error('resolve: sessionId was not a string')
        return sessionId
      }
      const activeSession = {id: ''}
      const sessionFor = async (session?: string): Promise<string> => session ?? (activeSession.id ||= await resolve())

      const callTool = async (name: string, input: unknown, session?: string): Promise<unknown> =>
        makeCallTool(base, await sessionFor(session))(name, input)

      const sendChat = (content: string, session: string): Promise<Response> =>
        post('/api/chat', {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content}]}]}, session)

      return {
        base,
        session: (id) => resolve(id),
        attach: async (session) => {
          const abort = new AbortController()
          aborts.push(abort)
          const id = await sessionFor(session)
          const response = await fetch(`${base}/api/chat/attach`, {
            headers: {[CONCIV_SESSION_HEADER]: id},
            signal: abort.signal,
          })
          return makeRunStream(parseSse(response, abort.signal))
        },
        chat: async (content, session) => {
          await sendChat(content, await sessionFor(session))
        },
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
          await Promise.all(disposers.map((dispose) => dispose()))
          await server.close()
          rmSync(stateRoot, {recursive: true, force: true})
        },
      }
    },
  }
}
