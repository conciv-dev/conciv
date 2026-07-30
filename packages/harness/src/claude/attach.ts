import {spawn} from 'node:child_process'
import {mkdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, isAbsolute, join, relative, resolve} from 'node:path'
import {z} from 'zod'
import type {
  HarnessAttach,
  HarnessAttachInstall,
  HarnessAttachRemoval,
  HarnessAttachResult,
  HarnessConnectFile,
  HarnessLiveSession,
} from '@conciv/protocol/harness-types'
import {claudeHooksManifest} from './hooks-plugin.js'
import {claudeConnectBridgeSource, CLAUDE_CONNECT_BRIDGE_FILE, CLAUDE_CONNECT_BRIDGE_URL_VAR} from './connect-bridge.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_MCP_SERVER, CLAUDE_CONNECT_PLUGIN} from './connect-names.js'

export const CLAUDE_RELOAD_COMMAND = '/reload-plugins --force'
export const CLAUDE_RELOAD_MIN_VERSION = '2.1.163'
export const CLAUDE_CONNECT_ROOT = 'claude-connect'

const AGENTS_TIMEOUT_MS = 2_000
const PLUGIN_TIMEOUT_MS = 20_000

const LiveSessionSchema = z.object({
  pid: z.number().int(),
  cwd: z.string().min(1),
  kind: z.string(),
  sessionId: z.string().min(1),
  name: z.string().optional(),
  status: z.enum(['idle', 'busy', 'shell']).optional(),
  startedAt: z.number().optional(),
})

const AgentsOutputSchema = z.union([
  z.array(z.unknown()),
  z.object({agents: z.array(z.unknown())}).transform((value) => value.agents),
])

type SpawnResult = {code: number; stdout: string; stderr: string}

function runClaude(argv: string[], opts: {cwd?: string; timeoutMs: number}): Promise<SpawnResult> {
  return new Promise((settle) => {
    const child = spawn('claude', argv, {cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe']})
    const out: string[] = []
    const err: string[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle({code: -1, stdout: '', stderr: 'timed out'})
    }, opts.timeoutMs)
    timer.unref?.()
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk.toString()))
    child.once('error', (error: Error) => {
      clearTimeout(timer)
      settle({code: -1, stdout: '', stderr: error.message})
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      settle({code: code ?? -1, stdout: out.join(''), stderr: err.join('')})
    })
  })
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function inside(parent: string, child: string): boolean {
  const step = relative(parent, child)
  return step.length > 0 && !step.startsWith('..') && !isAbsolute(step)
}

export function relatedCwd(sessionCwd: string, cwd: string): boolean {
  const from = realpathOrSelf(sessionCwd)
  const to = realpathOrSelf(cwd)
  return from === to || inside(from, to) || inside(to, from)
}

export function parseLiveSessions(raw: string): HarnessLiveSession[] {
  const listed = AgentsOutputSchema.safeParse(safeJson(raw))
  if (!listed.success) return []
  return listed.data.flatMap((value) => {
    const parsed = LiveSessionSchema.safeParse(value)
    if (!parsed.success) return []
    const entry = parsed.data
    if (entry.kind !== 'interactive') return []
    return [
      {
        sessionId: entry.sessionId,
        pid: entry.pid,
        cwd: entry.cwd,
        name: entry.name ?? entry.sessionId.slice(0, 8),
        status: entry.status ?? 'idle',
        ...(entry.startedAt === undefined ? {} : {startedAt: entry.startedAt}),
      },
    ]
  })
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function meetsReloadFloor(version: string, floor = CLAUDE_RELOAD_MIN_VERSION): boolean {
  const parse = (value: string): number[] => {
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(value)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : []
  }
  const found = parse(version)
  const want = parse(floor)
  if (found.length !== 3) return false
  for (let index = 0; index < 3; index++) {
    const left = found[index] ?? 0
    const right = want[index] ?? 0
    if (left !== right) return left > right
  }
  return true
}

export function claudeConnectDir(stateDir: string): string {
  return join(stateDir, CLAUDE_CONNECT_ROOT)
}

function marketplaceManifest(): string {
  return `${JSON.stringify(
    {
      name: CLAUDE_CONNECT_MARKETPLACE,
      owner: {name: 'conciv'},
      plugins: [
        {
          name: CLAUDE_CONNECT_PLUGIN,
          source: `./${CLAUDE_CONNECT_PLUGIN}`,
          description: 'Connects a running claude session to the conciv widget.',
        },
      ],
    },
    null,
    2,
  )}\n`
}

function pluginManifest(): string {
  return `${JSON.stringify(
    {
      name: CLAUDE_CONNECT_PLUGIN,
      version: '0.0.0',
      description: 'Connects a running claude session to the conciv widget.',
      author: {name: 'conciv'},
    },
    null,
    2,
  )}\n`
}

function mcpManifest(opts: {mcpUrl: string}): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [CLAUDE_CONNECT_MCP_SERVER]: {
          type: 'stdio',
          command: 'node',
          args: [`\${CLAUDE_PLUGIN_ROOT}/bin/${CLAUDE_CONNECT_BRIDGE_FILE}`],
          env: {[CLAUDE_CONNECT_BRIDGE_URL_VAR]: opts.mcpUrl},
        },
      },
    },
    null,
    2,
  )}\n`
}

const BRIDGE_FILE_MODE = 0o700

export function claudeConnectPluginFiles(opts: {
  stateDir: string
  mcpUrl: string
  hookUrl: string
}): HarnessConnectFile[] {
  const root = claudeConnectDir(opts.stateDir)
  const plugin = join(root, CLAUDE_CONNECT_PLUGIN)
  return [
    {path: join(root, '.claude-plugin', 'marketplace.json'), contents: marketplaceManifest()},
    {path: join(plugin, '.claude-plugin', 'plugin.json'), contents: pluginManifest()},
    {
      path: join(plugin, 'bin', CLAUDE_CONNECT_BRIDGE_FILE),
      contents: claudeConnectBridgeSource(),
      mode: BRIDGE_FILE_MODE,
    },
    {path: join(plugin, '.mcp.json'), contents: mcpManifest(opts)},
    {path: join(plugin, 'hooks', 'hooks.json'), contents: claudeHooksManifest({hookUrl: opts.hookUrl})},
  ]
}

async function claudeVersion(): Promise<string | null> {
  const probe = await runClaude(['--version'], {timeoutMs: AGENTS_TIMEOUT_MS})
  return probe.code === 0 ? probe.stdout.trim() : null
}

async function candidates(cwd: string): Promise<HarnessLiveSession[]> {
  const listed = await runClaude(['agents', '--json'], {timeoutMs: AGENTS_TIMEOUT_MS})
  if (listed.code !== 0) return []
  return parseLiveSessions(listed.stdout).filter((session) => relatedCwd(session.cwd, cwd))
}

const CONNECT_FILE_MODE = 0o600

function writeConnectFiles(files: HarnessConnectFile[]): void {
  for (const file of files) {
    mkdirSync(dirname(file.path), {recursive: true})
    writeFileSync(file.path, file.contents, {mode: file.mode ?? CONNECT_FILE_MODE})
  }
}

async function install(opts: HarnessAttachInstall): Promise<HarnessAttachResult> {
  const version = await claudeVersion()
  if (version === null) return failure('claude is not installed or did not report a version')
  if (!meetsReloadFloor(version))
    return failure(`claude ${version} lacks ${CLAUDE_RELOAD_COMMAND} (needs ${CLAUDE_RELOAD_MIN_VERSION}+)`)
  const root = claudeConnectDir(opts.stateDir)
  writeConnectFiles(claudeConnectPluginFiles({stateDir: opts.stateDir, mcpUrl: opts.mcpUrl, hookUrl: opts.hookUrl}))
  const added = await runClaude(['plugin', 'marketplace', 'add', root], {cwd: opts.root, timeoutMs: PLUGIN_TIMEOUT_MS})
  if (added.code !== 0) return failure(commandDetail('marketplace add', added))
  await runClaude(
    ['plugin', 'uninstall', `${CLAUDE_CONNECT_PLUGIN}@${CLAUDE_CONNECT_MARKETPLACE}`, '--scope', 'local'],
    {
      cwd: opts.root,
      timeoutMs: PLUGIN_TIMEOUT_MS,
    },
  )
  const installed = await runClaude(
    ['plugin', 'install', `${CLAUDE_CONNECT_PLUGIN}@${CLAUDE_CONNECT_MARKETPLACE}`, '--scope', 'local'],
    {cwd: opts.root, timeoutMs: PLUGIN_TIMEOUT_MS},
  )
  if (installed.code !== 0) return failure(commandDetail('plugin install', installed))
  return {ok: true, reloadCommand: CLAUDE_RELOAD_COMMAND}
}

function commandDetail(step: string, result: SpawnResult): string {
  const reason = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
  return `claude ${step} failed: ${reason}`
}

function failure(detail: string): HarnessAttachResult {
  return {ok: false, reloadCommand: '', detail}
}

async function uninstall(opts: HarnessAttachRemoval): Promise<void> {
  await runClaude(
    ['plugin', 'uninstall', `${CLAUDE_CONNECT_PLUGIN}@${CLAUDE_CONNECT_MARKETPLACE}`, '--scope', 'local'],
    {
      cwd: opts.root,
      timeoutMs: PLUGIN_TIMEOUT_MS,
    },
  )
  await runClaude(['plugin', 'marketplace', 'remove', CLAUDE_CONNECT_MARKETPLACE], {
    cwd: opts.root,
    timeoutMs: PLUGIN_TIMEOUT_MS,
  })
  rmSync(claudeConnectDir(opts.stateDir), {recursive: true, force: true})
}

export const claudeAttach: HarnessAttach = {candidates: (cwd) => candidates(cwd), install, uninstall}
