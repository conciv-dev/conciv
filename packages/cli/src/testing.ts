import {spawn, type ChildProcessByStdio} from 'node:child_process'
import {once} from 'node:events'
import {mkdirSync, mkdtempSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createServer} from 'node:net'
import {constants, tmpdir} from 'node:os'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import type {Readable, Writable} from 'node:stream'
import type {TestAPI} from 'vitest'
import {createEngineTest} from '@conciv/core/testing'
import {z} from 'zod'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {stdioTransport} from '@tanstack/ai-mcp/stdio'
import {isolatedEnv} from '@conciv/vitest-config/isolated-env'

const CLI_DEADLINE_MS = 60_000

const CLI_BIN = createRequire(import.meta.url).resolve('@conciv/cli/bin')

export type CliEngine = {address: {apiBase: string; token: string}; home: string}

export type CliOptions = {cwd?: string; env?: Record<string, string>; engine?: CliEngine}

export type CliRun = {stdout: string; stderr: string; exitCode: number}

function exitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code
  return 128 + (signal === null ? 0 : constants.signals[signal])
}

async function closedPort(): Promise<string> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  server.close()
  await once(server, 'close')
  if (address === null || typeof address === 'string')
    throw new Error('the kit could not open a local port for the CLI')
  return String(address.port)
}

async function engineEnv(options: CliOptions): Promise<Record<string, string>> {
  if (options.engine !== undefined) {
    const {apiBase, token} = options.engine.address
    return {CONCIV_PORT: new URL(apiBase).port, CONCIV_TOKEN: token, CONCIV_HOME: options.engine.home}
  }
  if (options.cwd !== undefined || options.env?.CONCIV_PORT !== undefined) return {}
  return {CONCIV_PORT: await closedPort()}
}

function runChild(args: string[], options: CliOptions, home: string, reach: Record<string, string>): Promise<CliRun> {
  const temporary = join(home, 'tmp')
  mkdirSync(temporary, {recursive: true})
  const child = spawn(process.execPath, [CLI_BIN, ...args], {
    cwd: options.cwd ?? home,
    env: {...isolatedEnv(process.env, home, temporary), ...reach, ...options.env},
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: AbortSignal.timeout(CLI_DEADLINE_MS),
  })
  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => stdout.push(chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr.push(chunk))
  const failure: {error?: Error} = {}
  const {promise, resolve, reject} = Promise.withResolvers<CliRun>()
  child.on('error', (error) => {
    failure.error =
      error.name === 'AbortError'
        ? new Error(`the conciv CLI gave no result within ${CLI_DEADLINE_MS}ms`, {cause: error})
        : error
  })
  child.on('close', (code, signal) => {
    if (failure.error !== undefined) reject(failure.error)
    else resolve({stdout: stdout.join(''), stderr: stderr.join(''), exitCode: exitCode(code, signal)})
  })
  return promise
}

export async function cli(args: string[], options: CliOptions = {}): Promise<CliRun> {
  if (options.engine !== undefined) return runChild(args, options, options.engine.home, await engineEnv(options))
  // oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the CLI call's own home, as opencode's cli test helper: removed in the finally below
  const home = mkdtempSync(join(tmpdir(), 'conciv-cli-'))
  try {
    return await runChild(args, options, home, await engineEnv(options))
  } finally {
    await rm(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  }
}

const HUB_ARGS = [CLI_BIN, 'mcp', 'serve', '--agent', 'claude']

const TASKS_ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': {name: 'hub-test', version: '1.0.0'},
  'io.modelcontextprotocol/clientCapabilities': {extensions: {'io.modelcontextprotocol/tasks': {}}},
}

const ReplySchema = z.object({id: z.number(), result: z.looseObject({})})

export type TasksClient = {
  request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export type HubFixtures = {
  hub: (home: string) => Promise<MCPClient>
  tasksHub: (home: string) => TasksClient
}

type EngineTest = ReturnType<typeof createEngineTest>

type EngineFixtures = EngineTest extends TestAPI<infer Fixtures> ? Fixtures : never

const base: EngineTest = createEngineTest()

export const test: TestAPI<EngineFixtures & HubFixtures> = base.extend<HubFixtures>({
  hub: async ({task: _task}, use) => {
    const clients: MCPClient[] = []
    await use(async (home) => {
      const client = await createMCPClient({
        transport: stdioTransport({command: process.execPath, args: HUB_ARGS, env: {CONCIV_HOME: home, HOME: home}}),
      })
      clients.push(client)
      return client
    })
    await Promise.all(clients.map((client) => client.close()))
  },
  tasksHub: async ({task: _task}, use) => {
    const children: ChildProcessByStdio<Writable, Readable, null>[] = []
    await use((home) => {
      const child = spawn(process.execPath, HUB_ARGS, {
        env: {...process.env, CONCIV_HOME: home, HOME: home},
        stdio: ['pipe', 'pipe', 'inherit'],
      })
      children.push(child)
      const waiting = new Map<number, (result: Record<string, unknown>) => void>()
      createInterface({input: child.stdout}).on('line', (line) => {
        const reply = ReplySchema.safeParse(JSON.parse(line))
        if (reply.success) waiting.get(reply.data.id)?.(reply.data.result)
      })
      const sent = {next: 1}
      return {
        request: (method, params) => {
          const id = sent.next++
          const replied = new Promise<Record<string, unknown>>((resolve) => waiting.set(id, resolve))
          child.stdin.write(
            `${JSON.stringify({jsonrpc: '2.0', id, method, params: {...params, _meta: TASKS_ENVELOPE}})}\n`,
          )
          return replied
        },
      }
    })
    await Promise.all(
      children.map(async (child) => {
        child.stdin.end()
        await once(child, 'exit')
      }),
    )
  },
})
