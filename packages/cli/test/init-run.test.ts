import {execFileSync} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {claudeConnectDir} from '@conciv/harness/claude-connect-files'
import {runInit, type InitRuntime, type LedgerEntry} from '../src/init/pipeline.js'
import {readConsent} from '../src/init/steps/harness/consent.js'

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
  lines: string[]
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
  const lines: string[] = []
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
    output: (line) => lines.push(line),
  }
  return {cwd, home, lines, spawned, added, runtime}
}

const byId = (entries: LedgerEntry[]) => Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))

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
    const output = run.lines.join('\n')
    expect(output).toContain('pnpm dev')
    expect(output).toContain('conciv tools --help')
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
  })

  it('refuses a dirty tree with the reason and exit code 1', async () => {
    const run = fixture()
    writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
    const entries = await runInit({yes: true, dryRun: false, force: false, cwd: run.cwd}, run.runtime)
    expect(entries).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    expect(run.lines.join('\n')).toContain('uncommitted changes')
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })

  it('treats a wizard cancel as a clean no-op that changes nothing', async () => {
    const run = fixture()
    const entries = await runInit(
      {yes: false, dryRun: false, force: false, cwd: run.cwd},
      {...run.runtime, prompts: async () => 'cancelled'},
    )
    expect(entries).toEqual([])
    expect(process.exitCode).toBeUndefined()
    expect(run.lines.join('\n')).toContain('nothing changed')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
  })
})
