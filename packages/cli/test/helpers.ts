import type {PageOutcome} from '@conciv/protocol/page-types'
import {approvePending, type BootApp, createFakeHarness, createTestkit, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {ResolvedConcivConfig} from '@conciv/core/config'
import {afterEach, beforeEach, expect, vi} from 'vitest'
import {execFileSync} from 'node:child_process'
import {appendFileSync, chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import type {LedgerEntry, StepNote} from '../src/init/ledger.js'
import type {InitContext, InitResult, InitRuntime, RunSettings} from '../src/init/pipeline.js'
import type {InitOutput, PlanPrompts} from '../src/init/wizard.js'
import type {FileBackup} from '../src/init/interrupt.js'

export type BootExtras = {
  bridge?: Parameters<typeof makeApp>[0]['bridge']
  openInEditor?: (file: string, line?: number) => void
  extensions?: Parameters<typeof makeApp>[0]['extensions']
}

function bootCliApp(extras: BootExtras): BootApp {
  return async (env) => {
    const cfg: ResolvedConcivConfig = {
      enabled: true,
      widgetUrl: undefined,
      stateRoot: env.stateRoot,
      harness: env.harness.id,
      harnessBin: undefined,
      sessionId: undefined,
      harnessSessionId: undefined,
      systemPrompt: '',
      extensions: undefined,
    }
    const {app, dispose, hub, claimUpgrade, loginToken} = await makeApp({
      cfg,
      cwd: env.cwd,
      openInEditor: extras.openInEditor ?? (() => {}),
      harness: env.harness,
      bridge: extras.bridge,
      extensions: extras.extensions,
    })
    return {fetch: app.fetch, dispose, hub, claimUpgrade, loginToken}
  }
}

export async function bootCli(cleanups: (() => Promise<void>)[], extras: BootExtras = {}): Promise<Kit> {
  const kit = await createTestkit(createFakeHarness(), bootCliApp(extras)).setup()
  cleanups.push(() => {
    delete process.env.CONCIV_SESSION_ID
    return kit.cleanup()
  })
  process.env.CONCIV_PORT = new URL(kit.base).port
  process.env.CONCIV_SESSION_ID = await kit.session()
  return kit
}

export async function approvedSession(kit: Kit): Promise<{sessionId: string; approve: () => Promise<string[]>}> {
  const {sessionId} = await kit.rpc.sessions.create(undefined)
  process.env.CONCIV_SESSION_ID = sessionId
  return {sessionId, approve: () => approvePending(kit.base, sessionId)}
}

export type SeenQuery = Record<string, unknown>

type Queries = Awaited<ReturnType<Kit['rpc']['page']['queries']>>

type QueryState = {seen: SeenQuery | null}

async function answerFirst(
  kit: Kit,
  queries: Queries,
  state: QueryState,
  outcome: PageOutcome,
  abort: AbortController,
): Promise<void> {
  const first = await queries.next()
  if (first.done) return
  const query = first.value.query
  state.seen = typeof query === 'object' && query !== null ? {...query} : {}
  await kit.rpc.page.reply({requestId: first.value.requestId, outcome})
  abort.abort()
  await queries.return(undefined)
}

export async function answerNextQuery(kit: Kit, outcome: PageOutcome): Promise<{seen: () => SeenQuery | null}> {
  const abort = new AbortController()
  const queries = await kit.rpc.page.queries(undefined, {signal: abort.signal})
  const state: QueryState = {seen: null}
  void answerFirst(kit, queries, state, outcome, abort).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 50))
  return {seen: () => state.seen}
}

export type CliSession = {cleanups: (() => Promise<void>)[]; written: string[]}

export function cliSession(): CliSession {
  const session: CliSession = {cleanups: [], written: []}
  beforeEach(() => {
    captureStdout(session.written)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    delete process.env.CONCIV_PORT
    for (const cleanup of session.cleanups.splice(0)) await cleanup()
  })
  return session
}

const fixturesDir = new URL('./fixtures/', import.meta.url)

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

export function recorderOutput(events: string[]): InitOutput {
  return {
    intro: (title) => {
      events.push(`intro:${title}`)
    },
    spinner: (message) => {
      events.push(`spin:${message}`)
      return {
        stop: (summary) => {
          events.push(`spin-stop:${summary}`)
        },
        fail: (summary) => {
          events.push(`spin-fail:${summary}`)
        },
      }
    },
    plan: (body) => {
      events.push(`plan:${body}`)
    },
    step: (title) => {
      events.push(`step:${title}`)
      return {
        line: (text) => {
          events.push(`stepline:${text}`)
        },
        settle: (result) => {
          events.push(`settle:${result.status}:${result.summary}`)
        },
      }
    },
    note: (payload) => {
      events.push(`note:${payload.title}:${payload.body}`)
    },
    line: (text) => {
      events.push(`line:${text}`)
    },
    success: (message) => {
      events.push(`success:${message}`)
    },
    warn: (message) => {
      events.push(`warn:${message}`)
    },
    error: (message) => {
      events.push(`error:${message}`)
    },
    cancelled: (message) => {
      events.push(`cancel:${message}`)
    },
    outro: (message) => {
      events.push(`outro:${message}`)
    },
    failure: (message) => {
      events.push(`failure:${message}`)
    },
  }
}

export function captureStdout(written: string[]): void {
  written.length = 0
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
}

export function onlyDocument(written: string[]): unknown {
  expect(written).toHaveLength(1)
  return JSON.parse(written[0] ?? 'null')
}

export type StepHarness = {
  reports: string[]
  notes: StepNote[]
  backups: FileBackup[]
  events: string[]
  output: InitOutput
  ctx: InitContext
  settings: RunSettings
}

export function stepContext(cwd: string): StepHarness {
  const reports: string[] = []
  const notes: StepNote[] = []
  const backups: FileBackup[] = []
  const ctx: InitContext = {
    cwd,
    yes: true,
    dryRun: false,
    report: (line) => reports.push(line),
    note: (note) => notes.push(note),
    backup: (file) => backups.push(file),
    feed: () => {},
  }
  const settings: RunSettings = {cwd, yes: true, dryRun: false, backup: ctx.backup, interrupt: () => () => {}}
  const events: string[] = []
  return {reports, notes, backups, events, output: recorderOutput(events), ctx, settings}
}

export type FoundSelections = Parameters<PlanPrompts['selections']>[0]
