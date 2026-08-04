import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {Detected} from '../../../src/init/detect.js'
import type {InitContext} from '../../../src/init/pipeline.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {restoreBackupOnExit} from '../../../src/init/steps/framework/config-edit.js'
import {viteStep} from '../../../src/init/steps/framework/vite.js'
import {stepContext} from './step-context.js'

const fixturesDir = join(import.meta.dirname, '..', '..', 'fixtures')

const quickStartSnippet = `import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`

function project(fixtureName: string | null): {cwd: string; detected: Detected; reports: string[]; ctx: InitContext} {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-vite-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: 'app', devDependencies: {vite: '^7.0.0'}}))
  const configFile = fixtureName === null ? null : 'vite.config.ts'
  if (fixtureName !== null) {
    writeFileSync(join(cwd, 'vite.config.ts'), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
  }
  const detected: Detected = {framework: 'vite', configFile, packageManager: 'pnpm'}
  return {cwd, detected, ...stepContext(cwd)}
}

describe('viteStep', () => {
  it('applies onto the vite-react fixture, reports a unified diff, and flips detect to present', async () => {
    const {cwd, detected, reports, ctx} = project('vite.config.react.ts')
    const step = viteStep(detected)
    expect(step.id).toBe('framework')
    expect(await step.detect(ctx)).toBe('missing')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    const written = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    expect(written).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(written).toContain('plugins: [react(), conciv()]')
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    const diff = reports.join('\n')
    expect(diff).toContain('--- vite.config.ts')
    expect(diff).toContain('+++ vite.config.ts')
    expect(diff).toContain('-  plugins: [react()],')
    expect(diff).toContain('+  plugins: [react(), conciv()],')
    expect(diff).toContain("+import conciv from '@conciv/it/plugin/vite'")
  })

  it('reports already on the second run through the pipeline', async () => {
    const {detected, ctx} = project('vite.config.react.ts')
    const first = await runSteps([viteStep(detected)], ctx)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const second = await runSteps([viteStep(detected)], ctx)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
  })

  it('cards the no-plugins fixture with exactly the quick-start snippet and leaves the file alone', async () => {
    const {cwd, detected, ctx} = project('vite.config.no-plugins.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const ledger = await runSteps([viteStep(detected)], ctx)
    expect(ledger).toEqual([
      {
        id: 'framework',
        title: 'Wire the vite config',
        status: 'manual',
        cards: [
          {
            title: 'Wire the conciv vite plugin',
            body: 'conciv could not prove the shape of your vite config. Add the plugin yourself:',
            snippet: quickStartSnippet,
          },
        ],
      },
    ])
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('cards when the project has no config file', async () => {
    const {detected, ctx} = project(null)
    const outcome = await viteStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards[0]?.snippet).toBe(quickStartSnippet)
  })

  it('dry-run plans without touching the file', async () => {
    const {cwd, detected, reports, ctx} = project('vite.config.react.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const dryCtx: InitContext = {...ctx, dryRun: true}
    const ledger = await runSteps([viteStep(detected)], dryCtx)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(reports.join('\n')).toContain('vite.config.ts')
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('removes the restore exit listener after a successful apply', async () => {
    const {detected, ctx} = project('vite.config.react.ts')
    const baseline = process.listeners('exit').length
    expect(await viteStep(detected).apply(ctx)).toEqual({status: 'done'})
    expect(process.listeners('exit').length).toBe(baseline)
  })

  it('restoreBackupOnExit rewrites the original content when the process exits before release', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-vite-backup-'))
    const target = join(cwd, 'vite.config.ts')
    writeFileSync(target, 'original')
    const release = restoreBackupOnExit(target, 'original')
    writeFileSync(target, 'clobbered mid-write')
    process.emit('exit', 0)
    expect(readFileSync(target, 'utf8')).toBe('original')
    release()
    writeFileSync(target, 'after release')
    process.emit('exit', 0)
    expect(readFileSync(target, 'utf8')).toBe('after release')
  })
})
