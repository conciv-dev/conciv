import {mkdtemp, realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {inspect} from 'node:util'
import {start, type Engine, type LogEntry} from '@conciv/core/start'
import {ConfigProvider} from 'effect'
import {harnessRegistry} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/harness'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {seedWorkspace} from './seed-workspace.js'
import {CONNECT_SYSTEM_PROMPT} from './system-prompt.js'

const DEFAULT_ORIGIN = 'https://conciv.dev'

export type ConnectEvent =
  | {type: 'seeded'; seeded: boolean}
  | {type: 'started'; port: number; harness: string}
  | {type: 'client-connected'}

export type ConnectOpts = {
  token: string
  harness?: string
  workspace?: string
  origin?: string
  harnessAdapter?: HarnessAdapter
  onEvent?: (event: ConnectEvent) => void
  onShutdown?: () => void
}

async function resolveWorkspace(workspace: string | undefined): Promise<string> {
  if (workspace !== undefined) {
    if (workspace !== '.') throw new Error('workspace must be "." when provided')
    return realpath(process.cwd())
  }
  return realpath(await mkdtemp(join(tmpdir(), 'conciv-connect-')))
}

const shownLevels: readonly LogEntry['level'][] = ['warn', 'error', 'fatal']

function formatDetail(value: unknown): string {
  return typeof value === 'string' ? value : inspect(value)
}

function isLoginBanner(entry: LogEntry): boolean {
  return entry.level === 'info' && entry.attributes?.code !== undefined
}

function readErrors(entry: LogEntry): readonly unknown[] {
  const errors = Object.values(entry.attributes ?? {}).filter((value) => value instanceof Error)
  return entry.cause === undefined ? errors : [...errors, entry.cause]
}

function writeShownEntry(entry: LogEntry): void {
  if (isLoginBanner(entry)) return void process.stdout.write(`${entry.message}\n`)
  if (!shownLevels.includes(entry.level)) return
  process.stderr.write(`${[entry.message, ...readErrors(entry).map(formatDetail)].join(' ')}\n`)
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
}

function resolveAdapter(opts: ConnectOpts): HarnessAdapter {
  if (opts.harnessAdapter) return opts.harnessAdapter
  const id = opts.harness ?? 'claude'
  const registry = harnessRegistry(ConfigProvider.fromEnv({preserveEmptyStrings: true}))
  const adapter = registry.get(id)
  if (adapter) return adapter
  const known = registry
    .list()
    .map((registered) => registered.id)
    .join(', ')
  throw new Error(`conciv: unknown harness "${id}". Known harnesses: ${known}.`)
}

export async function runConnect(opts: ConnectOpts): Promise<Engine> {
  const adapter = resolveAdapter(opts)
  const root = await resolveWorkspace(opts.workspace)
  const onEvent = opts.onEvent ?? (() => {})
  if (opts.workspace === undefined) {
    const seeded = await seedWorkspace(opts.origin ?? DEFAULT_ORIGIN, root)
    onEvent({type: 'seeded', seeded})
  }
  let lastError: unknown
  for (let port = CONNECT_FIRST_PORT; port <= CONNECT_LAST_PORT; port += 1) {
    try {
      const engine = await start({
        options: {harness: adapter.id, stateRoot: root, systemPrompt: CONNECT_SYSTEM_PROMPT},
        root,
        port: {exact: port},
        launchEditor: () => {},
        harness: adapter,
        accessToken: opts.token,
        allowedOrigins: [opts.origin ?? DEFAULT_ORIGIN],
        onClientRequest: () => onEvent({type: 'client-connected'}),
        onShutdown: opts.onShutdown,
        log: {emit: writeShownEntry},
      })
      onEvent({type: 'started', port: engine.port, harness: adapter.id})
      return engine
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      lastError = error
    }
  }
  throw new Error(`no free port between ${CONNECT_FIRST_PORT} and ${CONNECT_LAST_PORT}: ${String(lastError)}`)
}
