import {execFile, spawn, spawnSync, type ChildProcessByStdio} from 'node:child_process'
import {once} from 'node:events'
import {chmodSync, cpSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {delimiter, dirname, join} from 'node:path'
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {pathToFileURL} from 'node:url'
import {promisify, stripVTControlCharacters} from 'node:util'
import {test as base} from 'vitest'
import {createServer, type InlineConfig, type ViteDevServer} from 'vite'
import {createServer as createNetServer, type Server} from 'node:net'
import webpack, {type Compiler, type Configuration, type Stats, type Watching} from 'webpack'
import {z} from 'zod'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {makeBrowserRpcClient, type BrowserRpcClient} from '@conciv/contract'

type Engine = ChildProcessByStdio<null, Readable, Readable>
type Hung = {engine: Engine; lines: AsyncIterator<string>}

type DevServer = ChildProcessByStdio<null, Readable, null>

function startHung(deadline: number): Hung {
  const deadlineModule = pathToFileURL(join(import.meta.dirname, '..', 'src', 'core', 'shutdown-deadline.ts')).href
  const program = [
    `import {install, track} from ${JSON.stringify(deadlineModule)}`,
    `install(${deadline})`,
    "track('conciv engine stopping')",
    'process.on("SIGTERM", () => {',
    `  setTimeout(() => process.exit(0), ${deadline * 10})`,
    "  console.log('SIGTERM_SEEN')",
    '})',
    'setInterval(() => {}, 1 << 30)',
    "console.log('SHUTDOWN_READY')",
  ].join('\n')
  const engine = spawn(process.execPath, ['--input-type=module', '-e', program], {stdio: ['ignore', 'pipe', 'pipe']})
  return {engine, lines: createInterface({input: engine.stdout})[Symbol.asyncIterator]()}
}

function runCompiler(compiler: Compiler): Promise<void> {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) return reject(error)
      if (stats?.hasErrors()) return reject(new Error(stats.toString('errors-only')))
      resolve()
    })
  })
}

function watchCompiler(compiler: Compiler, watchings: Watching[]): Promise<Stats> {
  return new Promise((resolve, reject) => {
    const watching = compiler.watch({}, (error, stats) => {
      if (error) return reject(error)
      if (stats === undefined) return reject(new Error('webpack watch gave no stats'))
      if (stats.hasErrors()) return reject(new Error(stats.toString('errors-only')))
      resolve(stats)
    })
    if (watching === undefined) return reject(new Error('webpack could not start watching'))
    watchings.push(watching)
  })
}

function closeWatching(watching: Watching): Promise<void> {
  return new Promise((resolve, reject) => {
    watching.close((error) => (error ? reject(error) : resolve()))
  })
}

async function holdPort(port: number, held: Server[]): Promise<number> {
  const server = createNetServer()
  held.push(server)
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no local port could be opened')
  return address.port
}

async function releasePort(server: Server): Promise<void> {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

function closeCompiler(compiler: Compiler): Promise<void> {
  return new Promise((resolve, reject) => {
    compiler.close((error) => (error ? reject(error) : resolve()))
  })
}

const RecordedEngineSchema = z.object({port: z.number().int(), token: z.string().min(1)})

type RecordedEngine = z.infer<typeof RecordedEngineSchema>

async function stopDevServer(server: DevServer): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exited = once(server, 'exit')
  server.kill('SIGINT')
  await exited
}

function openedFiles(log: string): string[] {
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
}

function nextOpened(log: string): Promise<string> {
  const seen = openedFiles(log).length
  const {promise, resolve, reject} = Promise.withResolvers<string>()
  const watcher = watch(log, {persistent: false}, () => {
    const file = openedFiles(log)[seen]
    if (file === undefined) return
    watcher.close()
    resolve(file)
  })
  watcher.on('error', reject)
  return promise
}

const NEXT_CONFIG_ENV_KEYS = ['CONCIV_OPTIONS', 'NEXT_PUBLIC_CONCIV_PORT']

const LoadedOptionsSchema = z.object({port: z.number().int()})

async function loadNextConfigPort(options: ConcivConfig): Promise<number> {
  const entry = pathToFileURL(join(import.meta.dirname, '..', 'dist', 'nextjs.js')).href
  const program = [
    `import {withConciv} from ${JSON.stringify(entry)}`,
    `const config = await withConciv({}, ${JSON.stringify(options)})`,
    'process.stdout.write(config.env.CONCIV_OPTIONS)',
  ].join('\n')
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !NEXT_CONFIG_ENV_KEYS.includes(name)))
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', program], {env})
  return LoadedOptionsSchema.parse(JSON.parse(stdout)).port
}

type UnpluginFixtures = {
  editor: {next: () => Promise<string>}
  viteDev: (options: ConcivConfig) => Promise<RecordedEngine>
  started: number[]
  browser: (url: string, token: string) => BrowserRpcClient
  hang: (deadline: number) => Hung
  project: (name: string) => string
  serve: (config: InlineConfig) => Promise<ViteDevServer>
  webpackBuild: (config: Configuration) => Promise<void>
  webpackWatch: (config: Configuration) => Promise<Stats>
  holdPort: (port?: number) => Promise<number>
  nextEnv: {forget: () => void}
  nextConfigPort: (options: ConcivConfig) => Promise<number>
}

export const test = base.extend<UnpluginFixtures>({
  editor: async ({task: _task}, use) => {
    const folder = tempDir('editor-')
    const log = join(folder, 'opened.log')
    const script = join(folder, 'editor')
    writeFileSync(log, '')
    writeFileSync(
      script,
      [
        '#!/usr/bin/env node',
        `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv[2] + '\\n')`,
      ].join('\n'),
    )
    chmodSync(script, 0o755)
    const previous = process.env['LAUNCH_EDITOR']
    process.env['LAUNCH_EDITOR'] = script
    await use({next: () => nextOpened(log)})
    if (previous === undefined) Reflect.deleteProperty(process.env, 'LAUNCH_EDITOR')
    else process.env['LAUNCH_EDITOR'] = previous
  },
  viteDev: async ({task: _task}, use) => {
    const servers: DevServer[] = []
    const viteBin = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
    const pluginEntry = pathToFileURL(join(import.meta.dirname, '..', 'dist', 'vite.js')).href
    await use(async (options) => {
      const root = tempDir('vite-dev-')
      const project = join(root, 'project')
      const home = join(root, 'home')
      const bin = join(root, 'bin')
      for (const folder of [project, home, bin]) mkdirSync(folder)
      writeFileSync(
        join(project, 'vite.config.mjs'),
        `import conciv from ${JSON.stringify(pluginEntry)}\nexport default {plugins: [conciv(${JSON.stringify({...options, homeDir: home})})]}\n`,
      )
      const server = spawn(process.execPath, [viteBin], {
        cwd: project,
        env: childEnv(bin, home),
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      servers.push(server)
      await readyLine(createInterface({input: server.stdout})[Symbol.asyncIterator]())
      return RecordedEngineSchema.parse(JSON.parse(readFileSync(join(concivStateDir(project), 'server.json'), 'utf8')))
    })
    await Promise.all(servers.map(stopDevServer))
  },
  project: async ({task: _task}, use) => {
    await use((name) => {
      const root = join(tempDir(`${name}-`), name)
      cpSync(join(import.meta.dirname, 'fixtures', name), root, {recursive: true})
      return root
    })
  },
  serve: async ({task: _task}, use) => {
    const servers: ViteDevServer[] = []
    await use(async (config) => {
      const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        ...config,
        server: {host: '127.0.0.1', port: 0, watch: null, ...config.server},
      })
      servers.push(server)
      await server.listen()
      return server
    })
    await Promise.all(servers.map((server) => server.close()))
  },
  webpackBuild: async ({task: _task}, use) => {
    const compilers: Compiler[] = []
    await use((config) => {
      const compiler = webpack(config)
      compilers.push(compiler)
      return runCompiler(compiler)
    })
    await Promise.all(compilers.map(closeCompiler))
  },
  webpackWatch: async ({task: _task}, use) => {
    const compilers: Compiler[] = []
    const watchings: Watching[] = []
    await use((config) => {
      const compiler = webpack(config)
      compilers.push(compiler)
      return watchCompiler(compiler, watchings)
    })
    await Promise.all(watchings.map(closeWatching))
    await Promise.all(compilers.map(closeCompiler))
  },
  nextEnv: [
    async ({task: _task}, use) => {
      const forget = () => {
        for (const key of NEXT_CONFIG_ENV_KEYS) Reflect.deleteProperty(process.env, key)
      }
      forget()
      await use({forget})
      forget()
    },
    {auto: true},
  ],
  nextConfigPort: async ({task: _task}, use) => {
    await use(loadNextConfigPort)
  },
  holdPort: async ({task: _task}, use) => {
    const held: Server[] = []
    await use((port = 0) => holdPort(port, held))
    await Promise.all(held.map(releasePort))
  },
  browser: async ({task: _task}, use) => {
    const clients: BrowserRpcClient[] = []
    await use((url, token) => {
      const client = makeBrowserRpcClient(url, {token})
      clients.push(client)
      return client
    })
    for (const client of clients) client.close()
  },
  started: async ({task: _task}, use) => {
    const started: number[] = []
    await use(started)
    for (const pid of started) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        continue
      }
    }
  },
  hang: async ({task: _task}, use) => {
    const started: Engine[] = []
    await use((deadline) => {
      const hung = startHung(deadline)
      started.push(hung.engine)
      return hung
    })
    for (const engine of started) engine.kill('SIGKILL')
  },
})

export function fakeClaude(bin: string, pidFile: string): void {
  const script = join(bin, 'claude')
  writeFileSync(
    script,
    [
      '#!/usr/bin/env node',
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
      "process.stdout.write(JSON.stringify({type: 'system', subtype: 'init', session_id: 'fake-session', model: 'opus', tools: [], mcp_servers: [], cwd: process.cwd()}) + '\\n')",
      'process.stdin.resume()',
      'setInterval(() => {}, 1 << 30)',
    ].join('\n'),
  )
  chmodSync(script, 0o755)
}

export function adapterFiles(project: string): string[] {
  return readdirSync(project).filter((name) => name.includes('tanstack'))
}

export function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}

export function childEnv(bin: string, home: string): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')))
  return {
    ...inherited,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    HOME: home,
    CONCIV_DISABLE_FILEWATCHER: 'true',
  }
}

export async function readLine(lines: AsyncIterator<string>, expected: string): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && next.value !== expected) next = await lines.next()
}

export async function readyLine(lines: AsyncIterator<string>): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && !stripVTControlCharacters(next.value).includes('Local:')) next = await lines.next()
}

export async function agentStarted(events: AsyncIterator<ChatEvent>): Promise<void> {
  let next = await events.next()
  while (
    next.done !== true &&
    !(next.value.type === ChatEventType.CUSTOM && next.value.name === 'claude-code.session-id')
  )
    next = await events.next()
}
