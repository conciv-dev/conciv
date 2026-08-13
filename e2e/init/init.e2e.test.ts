import {execFile, execFileSync} from 'node:child_process'
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
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
  const dependenciesMeta = manifest['dependenciesMeta']
  if (isRecord(dependenciesMeta)) {
    const strippedMeta = Object.fromEntries(
      Object.entries(dependenciesMeta).filter(([name]) => !name.startsWith('@conciv/')),
    )
    if (Object.keys(strippedMeta).length === 0) delete manifest['dependenciesMeta']
    else manifest['dependenciesMeta'] = strippedMeta
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

type AppShape = {detection: string; frameworkRow: RegExp}

const viteShape: AppShape = {
  detection: 'vite (vite.config.ts)',
  frameworkRow: /Wire the vite config\s+vite\.config\.ts/,
}

const appShapes = new Map<string, AppShape>([
  ['vite-react', viteShape],
  ['vite-vanilla', viteShape],
  [
    'nextjs',
    {detection: 'nextjs (next.config.ts)', frameworkRow: /Wire next\.js\s+next\.config\.ts, instrumentation\.ts,/},
  ],
])

function shapeOf(appName: string): AppShape {
  const shape = appShapes.get(appName)
  if (shape === undefined) throw new Error(`no plan shape for ${appName}`)
  return shape
}

function stripWiring(appName: string, cloneDir: string): void {
  if (appName === 'nextjs') {
    stripNextjsWiring(cloneDir)
    return
  }
  stripViteWiring(cloneDir)
}

function strippedClone(appName: string): string {
  const cloneDir = cloneApp(appName)
  stripWiring(appName, cloneDir)
  commitClone(cloneDir)
  return cloneDir
}

function expectPlanPreview(output: string, detection: string, frameworkRow: RegExp): void {
  expect(output).toContain('conciv init')
  expect(output).toContain(`Detected: ${detection}`)
  expect(output).toContain('harnesses: none found')
  expect(output).toContain('Plan')
  expect(output).toMatch(/Install @conciv\/it\s+package\.json/)
  expect(output).toMatch(/Install @conciv\/skills\s+package\.json/)
  expect(output).toMatch(frameworkRow)
  expect(output).toMatch(/Write the conciv skill\s+conciv\/skill\.md/)
  expect(output).toMatch(/Teach agents the conciv CLI\s+AGENTS\.md/)
  expect(output).toMatch(/Install the conciv claude plugin\s+\.conciv\/claude-connect/)
  expect(output).toContain('Harnesses: none found')
}

function expectChecklist(output: string, wiredLine: string): void {
  expect(output).toContain('Install @conciv/it — needs a manual step: No package manager auto-detected.')
  expect(output).toContain('Install @conciv/skills — needs a manual step: No package manager auto-detected.')
  expect(output).toContain(wiredLine)
  expect(output).toContain('Wrote conciv/skill.md')
  expect(output).toContain('Wrote the conciv section to AGENTS.md')
  expect(output).toContain('Install the conciv claude plugin — skipped: not selected')
}

function expectAppliedDiff(output: string, configFile: string, addedLine: string): void {
  expect(output).toContain(`--- ${configFile}`)
  expect(output).toContain(`+++ ${configFile}`)
  expect(output).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/)
  expect(output).toContain(`+${addedLine}`)
}

function expectInstallCard(output: string): void {
  expect(output).toContain('The automatic install failed. Run this in your project:')
  expect(output).toContain('npm install --save-dev @conciv/it')
  expect(output).toContain('npm install --save-dev @conciv/skills')
}

function expectClosingOutro(output: string): void {
  expect(output).toContain('3 wired · 2 manual steps below · 1 skipped')
  expect(output).toContain('└  Next steps — start your app:')
  expect(output).toContain('ask your agent to run conciv tools --help')
  expect(output).toContain('docs: https://conciv.dev/docs/quick-start')
}

function expectCommonOutcome(cloneDir: string, outcome: {code: number; output: string}, wiredLine: string): void {
  expect(outcome.code, outcome.output).toBe(0)
  expectChecklist(outcome.output, wiredLine)
  expectInstallCard(outcome.output)
  expectClosingOutro(outcome.output)
  expect(readFileSync(join(cloneDir, 'package.json'), 'utf8')).not.toContain('@conciv/it')
  expect(readFileSync(join(cloneDir, 'AGENTS.md'), 'utf8')).toContain('conciv/skill.md')
  expect(JSON.parse(readFileSync(join(cloneDir, '.conciv', 'harnesses.json'), 'utf8'))).toEqual({harnesses: []})
}

describe('conciv init against consumer-app clones', () => {
  it.each(['vite-react', 'vite-vanilla'])('wires a stripped %s clone end to end', async (appName) => {
    const cloneDir = strippedClone(appName)
    const outcome = await runInitCli(cloneDir, minimalTools())
    expectCommonOutcome(cloneDir, outcome, 'Wired vite.config.ts')
    expectPlanPreview(outcome.output, viteShape.detection, viteShape.frameworkRow)
    expectAppliedDiff(outcome.output, 'vite.config.ts', "import conciv from '@conciv/it/plugin/vite'")
    const original = readFileSync(join(repoRoot, 'e2e', appName, 'vite.config.ts'), 'utf8')
    expect(original).toContain("import conciv from '@conciv/it/plugin/vite'")
    const wired = readFileSync(join(cloneDir, 'vite.config.ts'), 'utf8')
    expect(wired).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(wired).toContain('conciv()')
    expect(changedPaths(cloneDir)).toEqual([' M vite.config.ts', '?? .conciv/', '?? AGENTS.md', '?? conciv/'])
  })

  it('wires a stripped nextjs clone end to end', async () => {
    const cloneDir = strippedClone('nextjs')
    const outcome = await runInitCli(cloneDir, minimalTools())
    const nextjsShape = shapeOf('nextjs')
    expectCommonOutcome(cloneDir, outcome, 'Wired next.js')
    expectPlanPreview(outcome.output, nextjsShape.detection, nextjsShape.frameworkRow)
    expectAppliedDiff(outcome.output, 'next.config.ts', "import {withConciv} from '@conciv/it/plugin/nextjs'")
    expect(outcome.output).toContain('created instrumentation.ts')
    expect(outcome.output).toContain('created instrumentation-client.ts')
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
      '?? conciv/',
      '?? instrumentation-client.ts',
      '?? instrumentation.ts',
    ])
  })

  it.each(['vite-react', 'vite-vanilla', 'nextjs'])(
    'prints the plan for a %s clone and touches nothing with --dry-run',
    async (appName) => {
      const cloneDir = strippedClone(appName)
      const shape = shapeOf(appName)
      const outcome = await runInitCli(cloneDir, minimalTools(), ['--dry-run'])
      expect(outcome.code, outcome.output).toBe(0)
      expectPlanPreview(outcome.output, shape.detection, shape.frameworkRow)
      expect(outcome.output).toContain('└  Dry run — nothing changed.')
      expect(outcome.output).not.toContain('Wired')
      expect(outcome.output).not.toContain('needs a manual step')
      expect(outcome.output).not.toContain('Next steps')
      expect(changedPaths(cloneDir)).toEqual([])
    },
  )

  it('reports every step as already wired on a second run and writes nothing', async () => {
    const cloneDir = strippedClone('vite-vanilla')
    const first = await runInitCli(cloneDir, minimalTools())
    expect(first.code, first.output).toBe(0)
    commitClone(cloneDir)
    const second = await runInitCli(cloneDir, minimalTools())
    expect(second.code, second.output).toBe(0)
    expect(second.output).toMatch(/Wire the vite config\s+already wired/)
    expect(second.output).toMatch(/Teach agents the conciv CLI\s+already wired/)
    expect(second.output).toContain('Wire the vite config — already wired')
    expect(second.output).toContain('Write the conciv skill — already wired')
    expect(second.output).toContain('Teach agents the conciv CLI — already wired')
    expect(second.output).toContain('3 already wired · 2 manual steps below · 1 skipped')
    expect(second.output).not.toContain('--- vite.config.ts')
    expect(changedPaths(cloneDir)).toEqual([])
  })

  it('refuses a non-interactive terminal without --yes and touches nothing', async () => {
    const cloneDir = strippedClone('vite-vanilla')
    const outcome = await runInitCli(cloneDir, minimalTools(), [])
    expect(outcome.code, outcome.output).toBe(1)
    expect(outcome.output).toContain('Non-interactive terminal — re-run with --yes or --dry-run')
    expect(outcome.output).toContain('conciv init stopped — nothing changed.')
    expect(outcome.output).not.toContain('Plan')
    expect(existsSync(join(cloneDir, '.conciv'))).toBe(false)
    expect(changedPaths(cloneDir)).toEqual([])
  })

  it('prints the whole experience without color escapes under NO_COLOR', async () => {
    const cloneDir = strippedClone('vite-vanilla')
    const outcome = await runInitCli(cloneDir, {...minimalTools(), NO_COLOR: '1'})
    expect(outcome.code, outcome.output).toBe(0)
    expectPlanPreview(outcome.output, viteShape.detection, viteShape.frameworkRow)
    expectChecklist(outcome.output, 'Wired vite.config.ts')
    expectAppliedDiff(outcome.output, 'vite.config.ts', "import conciv from '@conciv/it/plugin/vite'")
    expectInstallCard(outcome.output)
    expectClosingOutro(outcome.output)
    const colorEscape = new RegExp(`${String.fromCharCode(27)}\\[\\d+(;\\d+)*m`)
    expect(outcome.output).not.toMatch(colorEscape)
  })

  it('refuses a dirty clone with exit code 1 and touches nothing', async () => {
    const cloneDir = strippedClone('vite-vanilla')
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
