import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {z} from 'zod'
import {
  claudeConnectDir,
  claudeConnectPluginFiles,
  CLAUDE_CONNECT_INSTALL_TARGET,
} from '@conciv/harness/claude-connect-files'
import type {HarnessId} from '../../harness-detect.js'
import type {ManualCard, StepOutcome} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'

export type ClaudeIo = {home: string; run: (bin: string, args: string[]) => Promise<{code: number; output: string}>}

const installedPluginsSchema = z.object({plugins: z.record(z.string(), z.array(z.unknown()))})

function installedPluginsFile(home: string): string {
  return join(home, '.claude', 'plugins', 'installed_plugins.json')
}

function pluginInstalled(home: string): boolean {
  const raw = readFileOrNull(installedPluginsFile(home))
  if (raw === null) return false
  const parsed = installedPluginsSchema.safeParse(parseJsonOrNull(raw))
  if (!parsed.success) return false
  return (parsed.data.plugins[CLAUDE_CONNECT_INSTALL_TARGET] ?? []).length > 0
}

function stateDirOf(cwd: string): string {
  return join(cwd, '.conciv')
}

function marketplaceAddArgs(root: string): string[] {
  return ['plugin', 'marketplace', 'add', root]
}

function installArgs(): string[] {
  return ['plugin', 'install', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local']
}

function installCard(root: string): ManualCard {
  return {
    title: 'Install the conciv claude plugin',
    body: 'Register the generated conciv marketplace and install the connect plugin with the claude CLI. Full steps: https://conciv.dev/docs/quick-start/agents',
    snippet: [`claude ${marketplaceAddArgs(root).join(' ')}`, `claude ${installArgs().join(' ')}`].join('\n'),
  }
}

function writePluginFiles(stateDir: string): void {
  for (const file of claudeConnectPluginFiles({stateDir, mcpUrl: '', hookUrl: ''})) {
    mkdirSync(dirname(file.path), {recursive: true})
    writeFileSync(file.path, file.contents, {mode: file.mode ?? 0o600})
  }
}

async function runClaude(io: ClaudeIo, args: string[]): Promise<string | null> {
  const command = `claude ${args.join(' ')}`
  const outcome = await io.run('claude', args).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    return {code: -1, output: reason}
  })
  if (outcome.code === 0) return null
  const reason = outcome.output.trim()
  return reason.length === 0 ? `${command} failed` : `${command} failed: ${reason}`
}

async function applyClaude(ctx: InitContext, consented: () => HarnessId[], io: ClaudeIo): Promise<StepOutcome> {
  if (!consented().includes('claude')) return {status: 'skipped', detail: 'not selected'}
  const stateDir = stateDirOf(ctx.cwd)
  const root = claudeConnectDir(stateDir)
  writePluginFiles(stateDir)
  for (const args of [marketplaceAddArgs(root), installArgs()]) {
    const failed = await runClaude(io, args)
    if (failed !== null) return {status: 'manual', cards: [installCard(root)], detail: failed}
  }
  return {status: 'done'}
}

export function claudeStep(consented: () => HarnessId[], io: ClaudeIo): InitStep {
  return {
    id: 'claude',
    title: 'Install the conciv claude plugin',
    running: 'Installing the conciv claude plugin…',
    completed: 'Installed the conciv claude plugin',
    detect: async () => (pluginInstalled(io.home) ? 'present' : 'missing'),
    plan: async (ctx) => ({
      summary: `install ${CLAUDE_CONNECT_INSTALL_TARGET} through the claude plugin manager`,
      wouldEdit: [relative(ctx.cwd, claudeConnectDir(stateDirOf(ctx.cwd)))],
    }),
    apply: (ctx) => applyClaude(ctx, consented, io),
    verify: async () => pluginInstalled(io.home),
    manualCard: (ctx) => installCard(claudeConnectDir(stateDirOf(ctx.cwd))),
  }
}

function readFileOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function parseJsonOrNull(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
