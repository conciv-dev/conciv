import {existsSync, readFileSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {claudeConnectDir} from '@conciv/harness/claude-connect-files'
import {runInit} from '../src/init/pipeline.js'
import {readConsent, writeConsent} from '../src/init/steps/harness/consent.js'
import {commitAll, fixture, pendingChanges, recorderPrompts, statusById, stepsOf} from './support/init-fixture.js'

const plansOf = (events: string[]) => events.filter((event) => event.startsWith('plan:'))

const settlesOf = (events: string[]) => events.filter((event) => event.startsWith('settle:'))

function planLine(plan: string, title: string): string {
  const line = plan.split('\n').find((row) => row.includes(title))
  if (line === undefined) throw new Error(`plan has no row for ${title}`)
  return line
}

describe('runInit', () => {
  it('wires a vite project end to end with --yes over the injected runtime', async () => {
    const run = fixture()
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(statusById(result)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
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

  it('returns the completed steps and the next lines as data', async () => {
    const run = fixture()
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(result.outcome).toBe('completed')
    expect(result.outcome === 'completed' ? result.next : []).toEqual([
      'start your app: pnpm dev',
      'ask your agent to run conciv tools --help',
    ])
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
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(statusById(result)).toEqual({install: 'done', framework: 'manual', agents: 'done', claude: 'done'})
    expect(run.events).toContain('settle:manual:Wire the vite config — needs a manual step (see the card below)')
    expect(run.events.some((event) => event.startsWith('note:Wire the conciv vite plugin:'))).toBe(true)
    expect(run.events).toContain('warn:3 wired · 1 manual step below')
    expect(run.events).toContain('settle:done:Installed the conciv claude plugin')
  })

  it('resolves an unselected step as skipped with its reason', async () => {
    const run = fixture()
    const result = await runInit(
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
    expect(statusById(result).claude).toBe('skipped')
    expect(run.events).toContain('settle:skipped:Install the conciv claude plugin — skipped: not selected')
    expect(run.spawned).toEqual([])
  })

  it('renders the plan before the first prompt and applies an adjusted selection', async () => {
    const run = fixture()
    const decisions: ('adjust' | 'proceed')[] = ['adjust', 'proceed']
    const result = await runInit(
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
    expect(statusById(result)).toEqual({install: 'done', agents: 'done', claude: 'skipped'})
    expect(readConsent(run.cwd)).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('reports already on the second run for every step the first run completed', async () => {
    const run = fixture()
    const first = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    const doneIds = stepsOf(first)
      .filter((entry) => entry.status === 'done')
      .map((entry) => entry.id)
    expect(doneIds.length).toBeGreaterThan(0)
    commitAll(run.cwd)
    const second = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    for (const id of doneIds) {
      expect(statusById(second)[id], id).toBe('already')
    }
    expect(run.added).toEqual(['@conciv/it'])
    expect(run.spawned).toHaveLength(2)
    const plans = plansOf(run.events)
    expect(plans[1]).toContain('already wired')
    expect(run.events).toContain('settle:already:Install @conciv/it — already wired')
    expect(run.events).toContain('success:4 already wired')
  })

  it('plans the dry run against this run selections, not the harnesses a previous run recorded', async () => {
    const run = fixture()
    await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    writeConsent(run.cwd, ['claude', 'codex'])
    commitAll(run.cwd)
    const result = await runInit(
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
    const plan = result.outcome === 'planned' ? result.plan : ''
    expect(planLine(plan, 'Teach agents the conciv CLI')).toContain('already wired')
    expect(planLine(plan, 'Teach agents the conciv CLI')).not.toContain('AGENTS.md')
  })

  it('re-renders the plan against the adjusted harness selection', async () => {
    const run = fixture()
    await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    commitAll(run.cwd)
    const decisions: ('adjust' | 'proceed')[] = ['adjust', 'proceed']
    await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        prompts: {
          decide: async () => {
            const next = decisions.shift()
            if (next === undefined) throw new Error('ran out of decisions')
            return next
          },
          adjust: async () => ({framework: true, harnesses: []}),
        },
      },
    )
    const plans = plansOf(run.events).slice(-2)
    expect(plans).toHaveLength(2)
    expect(planLine(plans[1] ?? '', 'Teach agents the conciv CLI')).toContain('AGENTS.md')
    expect(planLine(plans[0] ?? '', 'Teach agents the conciv CLI')).toContain('already wired')
  })

  it('prints the plan and touches nothing with --dry-run', async () => {
    const run = fixture()
    const result = await runInit(
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
    expect(result.outcome).toBe('planned')
    expect(result.outcome === 'planned' ? result.plan : '').toContain('Install @conciv/it')
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
    const result = await runInit(
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
    expect(result).toEqual({outcome: 'refused', reason: 'Non-interactive terminal — re-run with --yes or --dry-run'})
    expect(run.events).toContain('error:Non-interactive terminal — re-run with --yes or --dry-run')
    expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
    expect(plansOf(run.events)).toEqual([])
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('runs a non-interactive terminal to completion with --yes', async () => {
    const run = fixture()
    const result = await runInit(
      {yes: true, dryRun: false, force: false, cwd: run.cwd},
      {...run.runtime, interactive: () => false},
    )
    expect(statusById(result)).toEqual({install: 'done', framework: 'done', agents: 'done', claude: 'done'})
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

  it('refuses a dirty tree with the reason', async () => {
    const run = fixture()
    writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(result).toEqual({outcome: 'refused', reason: 'uncommitted changes — commit first or pass --force'})
    expect(run.events).toContain('error:uncommitted changes — commit first or pass --force')
    expect(run.events.some((event) => event.startsWith('spin-fail:'))).toBe(true)
    expect(run.events.some((event) => event.startsWith('failure:'))).toBe(true)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('refuses a directory without a package.json with the reason', async () => {
    const run = fixture()
    const empty = mkdtempSync(join(tmpdir(), 'conciv-init-empty-'))
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: empty}, run.runtime)
    expect(result).toEqual({outcome: 'refused', reason: 'no package.json here — run init from your app directory'})
    expect(run.events).toContain('error:no package.json here — run init from your app directory')
  })

  it('plans the manual card honestly when no framework is detected', async () => {
    const run = fixture({configFixture: null, vite: false})
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('spin-stop:Detected: unknown · pnpm · harnesses: claude')
    expect(plansOf(run.events)[0]).toContain('manual — prints instructions')
    expect(statusById(result).framework).toBe('manual')
    expect(run.events.some((event) => event.startsWith('note:Wire conciv with Vite:'))).toBe(true)
  })

  it('wires an astro project through the vite plugin step', async () => {
    const run = fixture({configFixture: null, vite: false})
    writeFileSync(
      join(run.cwd, 'package.json'),
      `${JSON.stringify({name: 'fixture-app', version: '0.0.0', packageManager: 'pnpm@10.0.0', devDependencies: {astro: '^5.0.0'}}, null, 2)}\n`,
    )
    writeFileSync(
      join(run.cwd, 'astro.config.mjs'),
      readFileSync(join(import.meta.dirname, 'fixtures', 'astro.config.mjs'), 'utf8'),
    )
    commitAll(run.cwd)
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('spin-stop:Detected: astro (astro.config.mjs) · pnpm · harnesses: claude')
    expect(statusById(result).framework).toBe('done')
    const written = readFileSync(join(run.cwd, 'astro.config.mjs'), 'utf8')
    expect(written).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(written).toContain('plugins: [conciv()]')
  })

  it('says no harnesses were found and still teaches agents the CLI', async () => {
    const run = fixture({claude: false})
    const result = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(run.events).toContain('spin-stop:Detected: vite (vite.config.ts) · pnpm · harnesses: none found')
    expect(plansOf(run.events)[0]).toContain('Harnesses: none found')
    expect(statusById(result).agents).toBe('done')
    expect(statusById(result).claude).toBe('skipped')
    expect(readFileSync(join(run.cwd, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
  })

  it('reports a wizard cancel as a cancellation that changed nothing', async () => {
    const run = fixture()
    const result = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {...run.runtime, prompts: {...recorderPrompts(run.events), decide: async () => 'cancelled'}},
    )
    expect(result).toEqual({outcome: 'cancelled', reason: 'cancelled — nothing changed'})
    expect(run.events).toContain('cancel:Nothing changed.')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('reports a cancel inside adjust as a cancellation that changed nothing', async () => {
    const run = fixture()
    const result = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {
        ...run.runtime,
        prompts: {
          decide: async () => 'adjust',
          adjust: async () => 'cancelled',
        },
      },
    )
    expect(result.outcome).toBe('cancelled')
    expect(run.events).toContain('cancel:Nothing changed.')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })
})
