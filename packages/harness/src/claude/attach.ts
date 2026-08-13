import {spawn} from 'node:child_process'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname} from 'node:path'
import {z} from 'zod'
import type {
  HarnessAttach,
  HarnessAttachInstall,
  HarnessAttachRemoval,
  HarnessAttachResult,
  HarnessConnectFile,
  HarnessLiveSession,
} from '@conciv/protocol/harness-types'
import {claudeConnectEndpointFile, claudeConnectEndpointPath} from '@conciv/harness-init/claude/endpoint'
import {
  claudeConnectDir,
  claudeConnectPluginFiles,
  CLAUDE_CONNECT_INSTALL_TARGET,
} from '@conciv/harness-init/claude/files'
import {CLAUDE_CONNECT_MARKETPLACE} from '@conciv/harness-init/claude/names'
import {claudeConfigDir, claudeConnectServesProject, claudeInstallRecords} from '@conciv/harness-init/claude/state'
import {inside, realpathOrSelf} from '../_shared/cwd.js'
import {parseJsonOrNull} from '@conciv/harness-init/json'

export const CLAUDE_RELOAD_COMMAND = '/reload-plugins --force'
export const CLAUDE_RELOAD_MIN_VERSION = '2.1.163'

const VERSION_TIMEOUT_MS = 10_000
const AGENTS_TIMEOUT_MS = 5_000
const PLUGIN_TIMEOUT_MS = 20_000
const SIGKILL_ESCALATION_MS = 2_000

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

type SpawnOutcome =
  | {status: 'ok'; code: number; stdout: string; stderr: string}
  | {status: 'timeout'; detail: string}
  | {status: 'error'; detail: string}

function killGroup(pid: number | undefined, signal: NodeJS.Signals): boolean {
  if (pid === undefined) return false
  try {
    process.kill(-pid, signal)
    return true
  } catch {
    return false
  }
}

function startFailure(argv: string[], error: NodeJS.ErrnoException): string {
  if (error.code === 'ENOENT') return 'claude is not installed'
  return `claude ${argv[0] ?? ''} could not start: ${error.message}`
}

function runClaude(argv: string[], opts: {cwd?: string; timeoutMs: number}): Promise<SpawnOutcome> {
  return new Promise((settle) => {
    const child = spawn('claude', argv, {cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true})
    const out: string[] = []
    const err: string[] = []
    const timer = setTimeout(() => {
      killGroup(child.pid, 'SIGTERM')
      const escalate = setTimeout(() => killGroup(child.pid, 'SIGKILL'), SIGKILL_ESCALATION_MS)
      escalate.unref?.()
      settle({
        status: 'timeout',
        detail: `claude ${argv[0] ?? ''} timed out after ${Math.round(opts.timeoutMs / 1000)}s`,
      })
    }, opts.timeoutMs)
    timer.unref?.()
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk.toString()))
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      settle({status: 'error', detail: startFailure(argv, error)})
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      settle({status: 'ok', code: code ?? -1, stdout: out.join(''), stderr: err.join('')})
    })
  })
}

export function relatedCwd(sessionCwd: string, cwd: string): boolean {
  const from = realpathOrSelf(sessionCwd)
  const to = realpathOrSelf(cwd)
  return from === to || inside(from, to) || inside(to, from)
}

export function parseLiveSessions(raw: string): HarnessLiveSession[] {
  const listed = AgentsOutputSchema.safeParse(parseJsonOrNull(raw))
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

type VersionProbe = {status: 'ok'; version: string} | {status: 'failed'; detail: string}

async function claudeVersion(): Promise<VersionProbe> {
  const probe = await runClaude(['--version'], {timeoutMs: VERSION_TIMEOUT_MS})
  if (probe.status !== 'ok') return {status: 'failed', detail: probe.detail}
  const version = probe.stdout.trim()
  if (probe.code !== 0 || version.length === 0)
    return {status: 'failed', detail: 'claude is not installed or did not report a version'}
  return {status: 'ok', version}
}

async function candidates(cwd: string): Promise<HarnessLiveSession[]> {
  const listed = await runClaude(['agents', '--json'], {timeoutMs: AGENTS_TIMEOUT_MS})
  if (listed.status !== 'ok') throw new Error(listed.detail)
  if (listed.code !== 0) throw new Error(`claude agents exited with code ${listed.code}${reasonSuffix(listed)}`)
  return parseLiveSessions(listed.stdout).filter((session) => relatedCwd(session.cwd, cwd))
}

function reasonSuffix(result: {stdout: string; stderr: string}): string {
  const reason = result.stderr.trim() || result.stdout.trim()
  return reason.length === 0 ? '' : `: ${reason}`
}

const CONNECT_FILE_MODE = 0o600

function writeConnectFiles(files: HarnessConnectFile[]): void {
  for (const file of files) {
    mkdirSync(dirname(file.path), {recursive: true})
    writeFileSync(file.path, file.contents, {mode: file.mode ?? CONNECT_FILE_MODE})
  }
}

function configDir(): string {
  return claudeConfigDir({home: homedir(), override: process.env.CLAUDE_CONFIG_DIR})
}

function alreadyServing(files: HarnessConnectFile[], opts: HarnessAttachInstall): boolean {
  return claudeConnectServesProject({configDir: configDir(), stateDir: opts.stateDir, root: opts.root, files})
}

async function install(opts: HarnessAttachInstall): Promise<HarnessAttachResult> {
  const probe = await claudeVersion()
  if (probe.status === 'failed') return failure(probe.detail)
  if (!meetsReloadFloor(probe.version))
    return failure(`claude ${probe.version} lacks ${CLAUDE_RELOAD_COMMAND} (needs ${CLAUDE_RELOAD_MIN_VERSION}+)`)
  const root = claudeConnectDir(opts.stateDir)
  const files = claudeConnectPluginFiles({stateDir: opts.stateDir, cwd: opts.root})
  writeConnectFiles([...files, claudeConnectEndpointFile({stateDir: opts.stateDir, mcpUrl: opts.mcpUrl})])
  if (alreadyServing(files, opts)) return {ok: true, reloadCommand: CLAUDE_RELOAD_COMMAND}
  const added = stepFailure(
    'marketplace add',
    await runClaude(['plugin', 'marketplace', 'add', root], {cwd: opts.root, timeoutMs: PLUGIN_TIMEOUT_MS}),
  )
  if (added !== null) return failure(added)
  await runClaude(['plugin', 'uninstall', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local'], {
    cwd: opts.root,
    timeoutMs: PLUGIN_TIMEOUT_MS,
  })
  const installed = stepFailure(
    'plugin install',
    await runClaude(['plugin', 'install', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local'], {
      cwd: opts.root,
      timeoutMs: PLUGIN_TIMEOUT_MS,
    }),
  )
  if (installed !== null) return failure(installed)
  return {ok: true, reloadCommand: CLAUDE_RELOAD_COMMAND}
}

function stepFailure(step: string, outcome: SpawnOutcome): string | null {
  if (outcome.status !== 'ok') return outcome.detail
  if (outcome.code === 0) return null
  return `claude ${step} failed: ${outcome.stderr.trim() || outcome.stdout.trim() || `exit ${outcome.code}`}`
}

function failure(detail: string): HarnessAttachResult {
  return {ok: false, reloadCommand: '', detail}
}

async function uninstall(opts: HarnessAttachRemoval): Promise<void> {
  await runClaude(['plugin', 'uninstall', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local'], {
    cwd: opts.root,
    timeoutMs: PLUGIN_TIMEOUT_MS,
  })
  rmSync(claudeConnectDir(opts.stateDir), {recursive: true, force: true})
  rmSync(claudeConnectEndpointPath(opts.stateDir), {force: true})
  if (claudeInstallRecords(configDir()).length > 0) return
  await runClaude(['plugin', 'marketplace', 'remove', CLAUDE_CONNECT_MARKETPLACE], {
    cwd: opts.root,
    timeoutMs: PLUGIN_TIMEOUT_MS,
  })
}

export const claudeAttach: HarnessAttach = {candidates: (cwd) => candidates(cwd), install, uninstall}
