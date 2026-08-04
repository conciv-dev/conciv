import {execFileSync} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {claudeConnectDir} from '@conciv/harness/claude-connect-files'
import {runInit, type InitRuntime, type LedgerEntry} from '../src/init/pipeline.js'
import {readConsent} from '../src/init/steps/harness/consent.js'
import type {InitOutput, PlanPrompts} from '../src/init/wizard.js'

const viteConfigSource = readFileSync(new URL('./fixtures/vite.config.vanilla.ts', import.meta.url), 'utf8')

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  packageManager: z.string(),
  devDependencies: z.record(z.string(), z.string()),
})

type Fixture = {
  cwd: string
  home: string
  events: string[]
  spawned: string[]
  added: string[]
  runtime: Partial<InitRuntime>
}

function commitAll(cwd: string): void {
  execFileSync('git', ['add', '-A'], {cwd})
  execFileSync('git', ['-c', 'user.email=init@test', '-c', 'user.name=init', 'commit', '-m', 'seed', '--no-verify'], {
    cwd,
  })
}

function recorderOutput(events: string[]): InitOutput {
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
    line: (text) => {
      events.push(text)
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

function fixture(): Fixture {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-init-run-'))
  const home = mkdtempSync(join(tmpdir(), 'conciv-init-home-'))
  const binDir = join(home, 'shim-bin')
  mkdirSync(binDir, {recursive: true})
  writeFileSync(join(binDir, 'claude'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(binDir, 'claude'), 0o755)
  const manifest = {
    name: 'fixture-app',
    version: '0.0.0',
    packageManager: 'pnpm@10.0.0',
    devDependencies: {vite: '^8.0.0'},
  }
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(cwd, 'vite.config.ts'), viteConfigSource)
  execFileSync('git', ['init'], {cwd})
  commitAll(cwd)
  const events: string[] = []
  const spawned: string[] = []
  const added: string[] = []
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
  }
  return {cwd, home, events, spawned, added, runtime}
}

const byId = (entries: LedgerEntry[]) => Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))

const plansOf = (events: string[]) => events.filter((event) => event.startsWith('plan:'))

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
  })

  it('prints the plan and touches nothing with --dry-run', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: true, force: false, cwd: run.cwd},
      {
        ...run.runtime,
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
