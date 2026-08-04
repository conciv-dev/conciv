import {execFile, execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'
import {describe, expect, it} from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..')
const cliBin = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js')
const copySkips = new Set(['node_modules', 'dist', '.next', 'test-results', 'playwright-report'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function minimalTools(): {PATH: string; HOME: string} {
  const binDir = mkdtempSync(join(tmpdir(), 'conciv-init-tools-'))
  const home = mkdtempSync(join(tmpdir(), 'conciv-init-home-'))
  symlinkSync(process.execPath, join(binDir, 'node'))
  symlinkSync(execFileSync('which', ['git'], {encoding: 'utf8'}).trim(), join(binDir, 'git'))
  return {PATH: binDir, HOME: home}
}

function withoutConcivDependencies(cloneDir: string): void {
  const manifestPath = join(cloneDir, 'package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!isRecord(manifest)) throw new Error(`unusable package.json in ${cloneDir}`)
  for (const field of ['dependencies', 'devDependencies']) {
    const section = manifest[field]
    if (!isRecord(section)) continue
    manifest[field] = Object.fromEntries(Object.entries(section).filter(([name]) => !name.startsWith('@conciv/')))
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function cloneApp(appName: string): string {
  const cloneDir = mkdtempSync(join(tmpdir(), `conciv-init-${appName}-`))
  cpSync(join(repoRoot, 'e2e', appName), cloneDir, {
    recursive: true,
    filter: (source) => !copySkips.has(basename(source)),
  })
  withoutConcivDependencies(cloneDir)
  return cloneDir
}

function stripViteWiring(cloneDir: string): void {
  const configPath = join(cloneDir, 'vite.config.ts')
  const stripped = readFileSync(configPath, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('@conciv/'))
    .join('\n')
    .replace(/,?\s*conciv\(\{devEndpointDir: E2E_DEV_ENDPOINT_DIR\}\)/, '')
  expect(stripped).not.toContain('conciv')
  writeFileSync(configPath, stripped)
}

function stripNextjsWiring(cloneDir: string): void {
  rmSync(join(cloneDir, 'instrumentation.ts'))
  rmSync(join(cloneDir, 'instrumentation-client.ts'))
  const configPath = join(cloneDir, 'next.config.ts')
  const stripped = readFileSync(configPath, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('@conciv/'))
    .join('\n')
    .replace('withConciv(nextConfig)', 'nextConfig')
  expect(stripped).not.toContain('Conciv')
  writeFileSync(configPath, stripped)
}

function commitClone(cloneDir: string): void {
  execFileSync('git', ['init'], {cwd: cloneDir})
  execFileSync('git', ['add', '-A'], {cwd: cloneDir})
  execFileSync('git', ['-c', 'user.email=init@e2e', '-c', 'user.name=init', 'commit', '-m', 'seed', '--no-verify'], {
    cwd: cloneDir,
  })
}

function changedPaths(cloneDir: string): string[] {
  return execFileSync('git', ['status', '--porcelain'], {cwd: cloneDir, encoding: 'utf8'})
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^\?\? \.conciv\/.*$/, '?? .conciv/'))
    .toSorted()
}

function runInitCli(
  cloneDir: string,
  env: Record<string, string>,
  flags: string[] = ['--yes'],
): Promise<{code: number; output: string}> {
  return new Promise((settle, reject) => {
    execFile(process.execPath, [cliBin, 'init', ...flags], {cwd: cloneDir, env}, (error, stdout, stderr) => {
      if (error === null) {
        settle({code: 0, output: `${stdout}${stderr}`})
        return
      }
      if (typeof error.code !== 'number') {
        reject(error)
        return
      }
      settle({code: error.code, output: `${stdout}${stderr}`})
    })
  })
}

function expectPlanPreview(output: string, detection: string, frameworkRow: RegExp): void {
  expect(output).toContain('conciv init')
  expect(output).toContain(`Detected: ${detection}`)
  expect(output).toContain('harnesses: none found')
  expect(output).toContain('Plan')
  expect(output).toMatch(/Install @conciv\/it\s+package\.json/)
  expect(output).toMatch(frameworkRow)
  expect(output).toMatch(/Teach agents the conciv CLI\s+AGENTS\.md/)
  expect(output).toMatch(/Install the conciv claude plugin\s+\.conciv\/claude-connect/)
  expect(output).toContain('Harnesses: none found')
}

function expectCommonOutcome(cloneDir: string, outcome: {code: number; output: string}): void {
  expect(outcome.code, outcome.output).toBe(0)
  expect(outcome.output).toContain('Install @conciv/it — needs a manual step')
  expect(outcome.output).toContain('Install the conciv claude plugin — skipped: not selected')
  expect(outcome.output).toContain('manual step below')
  expect(outcome.output).toContain('Next steps — start your app:')
  expect(outcome.output).toContain('ask your agent to run conciv tools --help')
  expect(outcome.output).toContain('docs: https://conciv.dev/docs/quick-start')
  expect(outcome.output).toContain('└')
  expect(readFileSync(join(cloneDir, 'package.json'), 'utf8')).not.toContain('@conciv/it')
  expect(readFileSync(join(cloneDir, 'AGENTS.md'), 'utf8')).toContain('conciv tools')
  expect(JSON.parse(readFileSync(join(cloneDir, '.conciv', 'harnesses.json'), 'utf8'))).toEqual({harnesses: []})
}

describe('conciv init against consumer-app clones', () => {
  it.each(['vite-react', 'vite-vanilla'])('wires a stripped %s clone end to end', async (appName) => {
    const cloneDir = cloneApp(appName)
    stripViteWiring(cloneDir)
    commitClone(cloneDir)
    const outcome = await runInitCli(cloneDir, minimalTools())
    expectCommonOutcome(cloneDir, outcome)
    expectPlanPreview(outcome.output, 'vite (vite.config.ts)', /Wire the vite config\s+vite\.config\.ts/)
    const original = readFileSync(join(repoRoot, 'e2e', appName, 'vite.config.ts'), 'utf8')
    expect(original).toContain("import conciv from '@conciv/it/plugin/vite'")
    const wired = readFileSync(join(cloneDir, 'vite.config.ts'), 'utf8')
    expect(wired).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(wired).toContain('conciv()')
    expect(changedPaths(cloneDir)).toEqual([' M vite.config.ts', '?? .conciv/', '?? AGENTS.md'])
  })

  it('wires a stripped nextjs clone end to end', async () => {
    const cloneDir = cloneApp('nextjs')
    stripNextjsWiring(cloneDir)
    commitClone(cloneDir)
    const outcome = await runInitCli(cloneDir, minimalTools())
    expectCommonOutcome(cloneDir, outcome)
    expectPlanPreview(
      outcome.output,
      'nextjs (next.config.ts)',
      /Wire next\.js\s+next\.config\.ts, instrumentation\.ts,/,
    )
    const wired = readFileSync(join(cloneDir, 'next.config.ts'), 'utf8')
    expect(wired).toContain("import {withConciv} from '@conciv/it/plugin/nextjs'")
    expect(wired).toContain('withConciv(nextConfig)')
    for (const fileName of ['instrumentation.ts', 'instrumentation-client.ts']) {
      const original = readFileSync(join(repoRoot, 'e2e', 'nextjs', fileName), 'utf8')
      expect(readFileSync(join(cloneDir, fileName), 'utf8').trim()).toBe(original.trim())
    }
    expect(changedPaths(cloneDir)).toEqual([
      ' M next.config.ts',
      '?? .conciv/',
      '?? AGENTS.md',
      '?? instrumentation-client.ts',
      '?? instrumentation.ts',
    ])
  })

  it('prints the plan and touches nothing with --dry-run', async () => {
    const cloneDir = cloneApp('vite-vanilla')
    stripViteWiring(cloneDir)
    commitClone(cloneDir)
    const outcome = await runInitCli(cloneDir, minimalTools(), ['--dry-run'])
    expect(outcome.code, outcome.output).toBe(0)
    expectPlanPreview(outcome.output, 'vite (vite.config.ts)', /Wire the vite config\s+vite\.config\.ts/)
    expect(outcome.output).toContain('Dry run — nothing changed.')
    expect(changedPaths(cloneDir)).toEqual([])
  })

  it('refuses a non-interactive terminal without --yes and touches nothing', async () => {
    const cloneDir = cloneApp('vite-vanilla')
    stripViteWiring(cloneDir)
    commitClone(cloneDir)
    const outcome = await runInitCli(cloneDir, minimalTools(), [])
    expect(outcome.code, outcome.output).toBe(1)
    expect(outcome.output).toContain('Non-interactive terminal — re-run with --yes or --dry-run')
    expect(outcome.output).not.toContain('Plan')
    expect(changedPaths(cloneDir)).toEqual([])
  })

  it('prints no color escapes under NO_COLOR', async () => {
    const cloneDir = cloneApp('vite-vanilla')
    stripViteWiring(cloneDir)
    commitClone(cloneDir)
    const outcome = await runInitCli(cloneDir, {...minimalTools(), NO_COLOR: '1'})
    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.output).toContain('Wired vite.config.ts')
    const colorEscape = new RegExp(`${String.fromCharCode(27)}\\[\\d+(;\\d+)*m`)
    expect(outcome.output).not.toMatch(colorEscape)
  })

  it('refuses a dirty clone with exit code 1 and touches nothing', async () => {
    const cloneDir = cloneApp('vite-vanilla')
    stripViteWiring(cloneDir)
    commitClone(cloneDir)
    writeFileSync(join(cloneDir, 'scratch.txt'), 'uncommitted')
    const outcome = await runInitCli(cloneDir, minimalTools())
    expect(outcome.code, outcome.output).toBe(1)
    expect(outcome.output).toContain('uncommitted changes — commit first or pass --force')
    expect(outcome.output).toContain('conciv init stopped — nothing changed.')
    expect(outcome.output).not.toContain('Plan')
    expect(readFileSync(join(cloneDir, 'vite.config.ts'), 'utf8')).not.toContain('conciv')
    expect(changedPaths(cloneDir)).toEqual(['?? scratch.txt'])
  })
})
