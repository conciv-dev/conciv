import {execFileSync} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {claudeConnectDir} from '@conciv/harness/claude-connect-files'
import type {LedgerEntry} from '../src/init/ledger.js'
import {runInit, type InitRuntime} from '../src/init/pipeline.js'
import {readConsent} from '../src/init/steps/harness/consent.js'
import type {PlanPrompts} from '../src/init/wizard.js'
import {recorderOutput} from './support/init-output.js'

const fixturesDir = new URL('./fixtures/', import.meta.url)

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  packageManager: z.string(),
  devDependencies: z.record(z.string(), z.string()),
})

type FixtureOptions = {configFixture?: string | null; vite?: boolean; claude?: boolean}

type Fixture = {
  cwd: string
  home: string
  events: string[]
  spawned: string[]
  added: string[]
  exits: number[]
  runtime: Partial<InitRuntime>
}

function commitAll(cwd: string): void {
  execFileSync('git', ['add', '-A'], {cwd})
  execFileSync('git', ['-c', 'user.email=init@test', '-c', 'user.name=init', 'commit', '-m', 'seed', '--no-verify'], {
    cwd,
  })
}

function pendingChanges(cwd: string): string[] {
  return execFileSync('git', ['status', '--porcelain'], {cwd, encoding: 'utf8'})
    .split('\n')
    .filter((line) => line.length > 0)
    .toSorted()
}

function recorderPrompts(events: string[]): PlanPrompts {
  return {
    decide: async () => {
      events.push('decide')
      return 'proceed'
    },
    adjust: async (_found, current) => {
      events.push('adjust')
      return current
    },
  }
}

function fixture(options: FixtureOptions = {}): Fixture {
  const {configFixture = 'vite.config.vanilla.ts', vite = true, claude = true} = options
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
    spawn: async (bin, args) => {
      spawned.push(`${bin} ${args.join(' ')}`)
      if (args[0] === 'plugin' && args[1] === 'install') {
        mkdirSync(join(home, '.claude', 'plugins'), {recursive: true})
        writeFileSync(
          join(home, '.claude', 'plugins', 'installed_plugins.json'),
          JSON.stringify({version: 2, plugins: {'conciv-connect@conciv': [{scope: 'local'}]}}),
        )
      }
      return {code: 0, output: ''}
    },
    env: {PATH: binDir, HOME: home},
    prompts: recorderPrompts(events),
    output: recorderOutput(events),
    interactive: () => true,
    exit: (code) => {
      exits.push(code)
    },
  }
  return {cwd, home, events, spawned, added, exits, runtime}
}

const byId = (entries: LedgerEntry[]) => Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))

const plansOf = (events: string[]) => events.filter((event) => event.startsWith('plan:'))

const settlesOf = (events: string[]) => events.filter((event) => event.startsWith('settle:'))

describe('runInit', () => {
  it('wires a vite project end to end with --yes over the injected runtime', async () => {
    const run = fixture()
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(byId(entries)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
    expect(run.added).toEqual(['@conciv/it'])
    expect(readFileSync(join(run.cwd, 'package.json'), 'utf8')).toContain('@conciv/it')
    expect(readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')).toContain('@conciv/it/plugin/vite')
    expect(readFileSync(join(run.cwd, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
    expect(readConsent(run.cwd)).toEqual(['claude'])
    expect(run.spawned).toEqual([
      `claude plugin marketplace add ${claudeConnectDir(join(run.cwd, '.conciv'))}`,
      'claude plugin install conciv-connect@conciv --scope local',
    ])
    expect(run.events).toContain('intro:conciv init')
    expect(run.events).toContain('spin-stop:Detected: vite (vite.config.ts) · pnpm · harnesses: claude')
    expect(run.events).not.toContain('decide')
    const plans = plansOf(run.events)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toContain('Install @conciv/it')
    expect(plans[0]).toContain('package.json')
    expect(plans[0]).toContain('Wire the vite config')
    expect(plans[0]).toContain('vite.config.ts')
    expect(plans[0]).toContain('Teach agents the conciv CLI')
    expect(plans[0]).toContain('Install the conciv claude plugin')
    expect(plans[0]).toContain('● claude')
    expect(plans[0]).toContain('○ codex (not found)')
    const output = run.events.join('\n')
    expect(output).toContain('pnpm dev')
    expect(output).toContain('conciv tools --help')
  })

  it('runs every step as a live line that names the slow work and resolves in place', async () => {
    const run = fixture()
    await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('step:Installing @conciv/it with pnpm…')
    expect(run.events).toContain('step:Wiring vite.config.ts…')
    expect(run.events).toContain('step:Installing the conciv claude plugin…')
    expect(settlesOf(run.events)).toEqual([
      'settle:done:Installed @conciv/it',
      'settle:done:Wired vite.config.ts',
      'settle:done:Wrote the conciv section to AGENTS.md',
      'settle:done:Installed the conciv claude plugin',
    ])
    const stepAt = run.events.indexOf('step:Wiring vite.config.ts…')
    const settleAt = run.events.indexOf('settle:done:Wired vite.config.ts')
    expect(stepAt).toBeGreaterThan(-1)
    expect(settleAt).toBeGreaterThan(stepAt)
    expect(run.events).toContain('success:4 wired')
  })

  it('renders the applied config change as a note titled with the file, under its step', async () => {
    const run = fixture()
    await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    const diffNote = run.events.find((event) => event.startsWith('note:vite.config.ts:'))
    expect(diffNote).toBeDefined()
    expect(diffNote).toContain("+import conciv from '@conciv/it/plugin/vite'")
    expect(run.events.indexOf('settle:done:Wired vite.config.ts')).toBeLessThan(run.events.indexOf(diffNote ?? ''))
  })

  it('resolves a step that can only card as a manual line with its own reason and keeps going', async () => {
    const run = fixture({configFixture: 'vite.config.no-plugins.ts'})
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(byId(entries)).toEqual({install: 'done', framework: 'manual', agents: 'done', claude: 'done'})
    expect(process.exitCode).toBeUndefined()
    expect(run.events).toContain('settle:manual:Wire the vite config — needs a manual step (see the card below)')
    expect(run.events.some((event) => event.startsWith('note:Wire the conciv vite plugin:'))).toBe(true)
    expect(run.events).toContain('warn:3 wired · 1 manual step below')
    expect(run.events).toContain('settle:done:Installed the conciv claude plugin')
  })

  it('resolves an unselected step as skipped with its reason', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        prompts: {
          decide: async () => (run.events.includes('adjust') ? 'proceed' : 'adjust'),
          adjust: async () => {
            run.events.push('adjust')
            return {framework: true, harnesses: []}
          },
        },
      },
    )
    expect(byId(entries).claude).toBe('skipped')
    expect(run.events).toContain('settle:skipped:Install the conciv claude plugin — skipped: not selected')
    expect(run.spawned).toEqual([])
  })

  it('renders the plan before the first prompt and applies an adjusted selection', async () => {
    const run = fixture()
    const decisions: ('adjust' | 'proceed')[] = ['adjust', 'proceed']
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        prompts: {
          decide: async () => {
            run.events.push('decide')
            const next = decisions.shift()
            if (next === undefined) throw new Error('ran out of decisions')
            return next
          },
          adjust: async () => {
            run.events.push('adjust')
            return {framework: false, harnesses: []}
          },
        },
      },
    )
    const firstPlanAt = run.events.findIndex((event) => event.startsWith('plan:'))
    expect(firstPlanAt).toBeGreaterThanOrEqual(0)
    expect(firstPlanAt).toBeLessThan(run.events.indexOf('decide'))
    const plans = plansOf(run.events)
    expect(plans).toHaveLength(2)
    expect(plans[0]).toContain('Wire the vite config')
    expect(plans[1]).not.toContain('Wire the vite config')
    expect(plans[1]).toContain('○ claude (not selected)')
    expect(byId(entries)).toEqual({install: 'done', agents: 'done', claude: 'skipped'})
    expect(readConsent(run.cwd)).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('reports already on the second run for every step the first run completed', async () => {
    const run = fixture()
    const first = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    const doneIds = first.filter((entry) => entry.status === 'done').map((entry) => entry.id)
    expect(doneIds.length).toBeGreaterThan(0)
    commitAll(run.cwd)
    const second = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    for (const id of doneIds) {
      expect(second.find((entry) => entry.id === id)?.status, id).toBe('already')
    }
    expect(run.added).toEqual(['@conciv/it'])
    expect(run.spawned).toHaveLength(2)
    const plans = plansOf(run.events)
    expect(plans[1]).toContain('already wired')
    expect(run.events).toContain('settle:already:Install @conciv/it — already wired')
    expect(run.events).toContain('success:4 already wired')
  })

  it('prints the plan and touches nothing with --dry-run', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: true, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        interactive: () => false,
        prompts: {
          decide: async () => {
            throw new Error('decide must not run under --dry-run')
          },
          adjust: async () => {
            throw new Error('adjust must not run under --dry-run')
          },
        },
      },
    )
    expect(entries).toEqual([])
    expect(process.exitCode).toBeUndefined()
    const plans = plansOf(run.events)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toContain('Install @conciv/it')
    expect(run.events).toContain('outro:Dry run — nothing changed.')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('refuses a non-interactive terminal without --yes instead of waiting on an invisible prompt', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        interactive: () => false,
        prompts: {
          decide: async () => {
            throw new Error('decide must not run without a terminal')
          },
          adjust: async () => {
            throw new Error('adjust must not run without a terminal')
          },
        },
      },
    )
    expect(entries).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    expect(run.events).toContain('error:Non-interactive terminal — re-run with --yes or --dry-run')
    expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
    expect(plansOf(run.events)).toEqual([])
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('runs a non-interactive terminal to completion with --yes', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: true, dryRun: false, force: false, cwd: run.cwd},
      {...run.runtime, interactive: () => false},
    )
    expect(byId(entries)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
    expect(process.exitCode).toBeUndefined()
  })

  it('restores the config, says so, and exits 130 when the run is interrupted mid-apply', async () => {
    const run = fixture()
    const original = readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')
    const before = process.listeners('SIGINT')
    let fired = false
    await runInit(
      {yes: true, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        spawn: async (bin, args) => {
          if (!fired) {
            fired = true
            const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
            expect(added).toHaveLength(1)
            added[0]?.('SIGINT')
          }
          return {code: 0, output: `${bin} ${args.join(' ')}`}
        },
      },
    )
    expect(fired).toBe(true)
    expect(readFileSync(join(run.cwd, 'vite.config.ts'), 'utf8')).toBe(original)
    expect(run.events).toContain('cancel:Interrupted — your config was restored.')
    expect(run.exits).toEqual([130])
    expect(process.listeners('SIGINT')).toEqual(before)
  })

  it('leaves the working tree pristine when the run is interrupted mid-apply', async () => {
    const run = fixture()
    const before = process.listeners('SIGINT')
    let atInterrupt: string[] | null = null
    await runInit(
      {yes: true, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        spawn: async (bin, args) => {
          if (atInterrupt === null) {
            const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
            expect(added).toHaveLength(1)
            added[0]?.('SIGINT')
            atInterrupt = pendingChanges(run.cwd)
          }
          return {code: 0, output: `${bin} ${args.join(' ')}`}
        },
      },
    )
    expect(atInterrupt).toEqual([])
    expect(run.events).toContain('cancel:Interrupted — your config was restored.')
    expect(run.exits).toEqual([130])
  })

  it('refuses a dirty tree with the reason and exit code 1', async () => {
    const run = fixture()
    writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(entries).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    expect(run.events).toContain('error:uncommitted changes — commit first or pass --force')
    expect(run.events.some((event) => event.startsWith('spin-fail:'))).toBe(true)
    expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('refuses a directory without a package.json with the reason and exit code 1', async () => {
    const run = fixture()
    const empty = mkdtempSync(join(tmpdir(), 'conciv-init-empty-'))
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: empty}, run.runtime)
    expect(entries).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    expect(run.events).toContain('error:no package.json here — run init from your app directory')
  })

  it('plans the manual card honestly when no framework is detected', async () => {
    const run = fixture({configFixture: null, vite: false})
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('spin-stop:Detected: unknown · pnpm · harnesses: claude')
    expect(plansOf(run.events)[0]).toContain('manual — prints instructions')
    expect(byId(entries).framework).toBe('manual')
    expect(run.events.some((event) => event.startsWith('note:Wire conciv with Vite:'))).toBe(true)
  })

  it('says no harnesses were found and still teaches agents the CLI', async () => {
    const run = fixture({claude: false})
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('spin-stop:Detected: vite (vite.config.ts) · pnpm · harnesses: none found')
    expect(plansOf(run.events)[0]).toContain('Harnesses: none found')
    expect(byId(entries).agents).toBe('done')
    expect(byId(entries).claude).toBe('skipped')
    expect(readFileSync(join(run.cwd, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
  })

  it('treats a wizard cancel as a clean no-op that changes nothing', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {...run.runtime, prompts: {...recorderPrompts(run.events), decide: async () => 'cancelled'}},
    )
    expect(entries).toEqual([])
    expect(process.exitCode).toBeUndefined()
    expect(run.events).toContain('cancel:Nothing changed.')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('treats a cancel inside adjust as a clean no-op that changes nothing', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        prompts: {
          decide: async () => 'adjust',
          adjust: async () => 'cancelled',
        },
      },
    )
    expect(entries).toEqual([])
    expect(run.events).toContain('cancel:Nothing changed.')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })
})
