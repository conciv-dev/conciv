import {execFileSync} from 'node:child_process'
import {appendFileSync, chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import type {LedgerEntry} from '../../src/init/ledger.js'
import type {InitResult, InitRuntime} from '../../src/init/pipeline.js'
import type {PlanPrompts} from '../../src/init/wizard.js'
import {recorderOutput} from './init-output.js'

const fixturesDir = new URL('../fixtures/', import.meta.url)

const intentSkillsBlock = '<!-- intent-skills:start -->\nguidance\n<!-- intent-skills:end -->\n'

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  packageManager: z.string(),
  devDependencies: z.record(z.string(), z.string()),
})

export type FixtureOptions = {
  configFixture?: string | null
  vite?: boolean
  claude?: boolean
  recordOutput?: boolean
  injectInteractive?: boolean
}

export type Fixture = {
  cwd: string
  home: string
  events: string[]
  spawned: string[]
  added: string[]
  exits: number[]
  runtime: Partial<InitRuntime>
}

export function commitAll(cwd: string): void {
  execFileSync('git', ['add', '-A'], {cwd})
  execFileSync('git', ['-c', 'user.email=init@test', '-c', 'user.name=init', 'commit', '-m', 'seed', '--no-verify'], {
    cwd,
  })
}

export function pendingChanges(cwd: string): string[] {
  return execFileSync('git', ['status', '--porcelain'], {cwd, encoding: 'utf8'})
    .split('\n')
    .filter((line) => line.length > 0)
    .toSorted()
}

export function recorderPrompts(events: string[]): PlanPrompts {
  return {
    selections: async (found) => {
      events.push('selections')
      return {framework: true, harnesses: found.harnesses.map((one) => one.id), docsPack: false}
    },
    confirmRun: async () => {
      events.push('confirmRun')
      return true
    },
  }
}

export function stepsOf(result: InitResult): LedgerEntry[] {
  return result.outcome === 'completed' ? result.steps : []
}

export function statusById(result: InitResult): Record<string, string> {
  return Object.fromEntries(stepsOf(result).map((entry) => [entry.id, entry.status]))
}

function claudePluginsDir(home: string): string {
  return join(home, '.claude', 'plugins')
}

function claudeCacheDir(home: string): string {
  return join(claudePluginsDir(home), 'cache', 'conciv', 'conciv-connect', '0.0.0')
}

function copyPluginIntoCache(home: string, marketplaceRoot: string): void {
  const pluginRoot = join(marketplaceRoot, 'conciv-connect')
  cpSync(pluginRoot, claudeCacheDir(home), {recursive: true})
}

function recordClaudePluginState(opts: {home: string; cwd: string; args: string[]}): void {
  const [command, action, step, path] = opts.args
  if (command !== 'plugin') return
  mkdirSync(claudePluginsDir(opts.home), {recursive: true})
  if (action === 'marketplace' && step === 'add' && path !== undefined) {
    writeFileSync(join(claudePluginsDir(opts.home), 'marketplace-source'), path)
    writeFileSync(
      join(claudePluginsDir(opts.home), 'known_marketplaces.json'),
      JSON.stringify({conciv: {installLocation: path}}),
    )
    return
  }
  if (action !== 'install') return
  const root = readFileSync(join(claudePluginsDir(opts.home), 'marketplace-source'), 'utf8')
  copyPluginIntoCache(opts.home, root)
  writeFileSync(
    join(claudePluginsDir(opts.home), 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'conciv-connect@conciv': [
          {scope: 'local', version: '0.0.0', installPath: claudeCacheDir(opts.home), projectPath: opts.cwd},
        ],
      },
    }),
  )
}

export function fixture(options: FixtureOptions = {}): Fixture {
  const {configFixture = 'vite.config.vanilla.ts', vite = true, claude = true} = options
  const {recordOutput = true, injectInteractive = true} = options
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-init-run-'))
  const home = mkdtempSync(join(tmpdir(), 'conciv-init-home-'))
  const binDir = join(home, 'shim-bin')
  mkdirSync(binDir, {recursive: true})
  if (claude) {
    writeFileSync(join(binDir, 'claude'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(binDir, 'claude'), 0o755)
  }
  const manifest = {
    name: 'fixture-app',
    version: '0.0.0',
    packageManager: 'pnpm@10.0.0',
    devDependencies: vite ? {vite: '^8.0.0'} : {},
  }
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (configFixture !== null) {
    writeFileSync(join(cwd, 'vite.config.ts'), readFileSync(new URL(configFixture, fixturesDir), 'utf8'))
  }
  execFileSync('git', ['init'], {cwd})
  commitAll(cwd)
  const events: string[] = []
  const spawned: string[] = []
  const added: string[] = []
  const exits: number[] = []
  const runtime: Partial<InitRuntime> = {
    addDependency: async (name, opts) => {
      added.push(name)
      const current = manifestSchema.parse(JSON.parse(readFileSync(join(opts.cwd, 'package.json'), 'utf8')))
      current.devDependencies[name] = '0.0.0'
      writeFileSync(join(opts.cwd, 'package.json'), `${JSON.stringify(current, null, 2)}\n`)
    },
    spawn: async (bin, args, spawnCwd) => {
      spawned.push(`${bin} ${args.join(' ')}`)
      recordClaudePluginState({home, cwd: spawnCwd, args})
      if (args.includes('@tanstack/intent@latest') && args.includes('install')) {
        appendFileSync(join(spawnCwd, 'AGENTS.md'), intentSkillsBlock)
      }
      return {code: 0, output: ''}
    },
    env: {PATH: binDir, HOME: home},
    prompts: recorderPrompts(events),
    ...(injectInteractive ? {interactive: () => true} : {}),
    exit: (code) => {
      exits.push(code)
    },
    ...(recordOutput ? {output: recorderOutput(events)} : {}),
  }
  return {cwd, home, events, spawned, added, exits, runtime}
}
