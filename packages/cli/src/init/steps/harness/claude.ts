import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {
  claudeConnectDir,
  claudeConnectPluginBaseFiles,
  CLAUDE_CONNECT_INSTALL_TARGET,
} from '@conciv/claude-connect/files'
import {claudeConfigDir, claudeConnectServesProject} from '@conciv/claude-connect/state'
import type {HarnessId} from '../../harness-detect.js'
import {captureFile} from '../../interrupt.js'
import type {ManualCard, StepOutcome} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'

export type ClaudeIo = {
  home: string
  run: (bin: string, args: string[], cwd: string) => Promise<{code: number; output: string}>
}

function stateDirOf(cwd: string): string {
  return join(cwd, '.conciv')
}

function pluginServesProject(cwd: string, io: ClaudeIo): boolean {
  const stateDir = stateDirOf(cwd)
  return claudeConnectServesProject({
    configDir: claudeConfigDir({home: io.home, override: process.env.CLAUDE_CONFIG_DIR}),
    stateDir,
    root: cwd,
    files: claudeConnectPluginBaseFiles({stateDir}),
  })
}

function marketplaceAddArgs(root: string): string[] {
  return ['plugin', 'marketplace', 'add', root]
}

function installArgs(): string[] {
  return ['plugin', 'install', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local']
}

function shellQuoted(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`
}

function installCard(root: string): ManualCard {
  return {
    title: 'Install the conciv claude plugin',
    body: 'Register the generated conciv marketplace and install the connect plugin with the claude CLI. Full steps: https://conciv.dev/docs/quick-start/agents',
    snippet: [`claude plugin marketplace add ${shellQuoted(root)}`, `claude ${installArgs().join(' ')}`].join('\n'),
  }
}

function writePluginFiles(ctx: InitContext, stateDir: string): void {
  for (const file of claudeConnectPluginBaseFiles({stateDir})) {
    mkdirSync(dirname(file.path), {recursive: true})
    ctx.backup(captureFile(file.path))
    writeFileSync(file.path, file.contents, {mode: file.mode ?? 0o600})
  }
}

async function runClaude(ctx: InitContext, io: ClaudeIo, args: string[]): Promise<string | null> {
  const command = `claude ${args.join(' ')}`
  const outcome = await io.run('claude', args, ctx.cwd).catch((error: unknown) => {
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
  writePluginFiles(ctx, stateDir)
  for (const args of [marketplaceAddArgs(root), installArgs()]) {
    const failed = await runClaude(ctx, io, args)
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
    detect: async (ctx) => (consented().includes('claude') && pluginServesProject(ctx.cwd, io) ? 'present' : 'missing'),
    plan: async (ctx) => ({
      summary: `install ${CLAUDE_CONNECT_INSTALL_TARGET} through the claude plugin manager`,
      wouldEdit: [relative(ctx.cwd, claudeConnectDir(stateDirOf(ctx.cwd)))],
    }),
    apply: (ctx) => applyClaude(ctx, consented, io),
    verify: async (ctx) => pluginServesProject(ctx.cwd, io),
    manualCard: (ctx) => installCard(claudeConnectDir(stateDirOf(ctx.cwd))),
  }
}
