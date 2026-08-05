import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {Detected} from '../../../src/init/detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {viteStep} from '../../../src/init/steps/framework/vite.js'
import {stepContext} from './step-context.js'

const fixturesDir = join(import.meta.dirname, '..', '..', 'fixtures')

const quickStartSnippet = `import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`

function project(fixtureName: string | null): {cwd: string; detected: Detected} & ReturnType<typeof stepContext> {
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
    const {cwd, detected, notes, backups, ctx} = project('vite.config.react.ts')
    const step = viteStep(detected)
    expect(step.id).toBe('framework')
    expect(await step.detect(ctx)).toBe('missing')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    const written = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    expect(written).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(written).toContain('plugins: [react(), conciv()]')
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    expect(backups).toEqual([
      {path: join(cwd, 'vite.config.ts'), content: readFileSync(join(fixturesDir, 'vite.config.react.ts'), 'utf8')},
    ])
    expect(notes.map((note) => note.title)).toEqual(['vite.config.ts'])
    const diff = notes.map((note) => note.body).join('\n')
    expect(diff).toContain('--- vite.config.ts')
    expect(diff).toContain('+++ vite.config.ts')
    expect(diff).toContain('-  plugins: [react()],')
    expect(diff).toContain('+  plugins: [react(), conciv()],')
    expect(diff).toContain("+import conciv from '@conciv/it/plugin/vite'")
  })

  it('reports already on the second run through the pipeline', async () => {
    const {detected, settings, output} = project('vite.config.react.ts')
    const first = await runSteps([viteStep(detected)], settings, output)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const second = await runSteps([viteStep(detected)], settings, output)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
  })

  it('cards the no-plugins fixture with exactly the quick-start snippet and leaves the file alone', async () => {
    const {cwd, detected, settings, output} = project('vite.config.no-plugins.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const ledger = await runSteps([viteStep(detected)], settings, output)
    expect(ledger).toEqual([
      {
        id: 'framework',
        title: 'Wire the vite config',
        status: 'manual',
        cards: [
          {
            title: 'Wire the conciv vite plugin',
            body: 'conciv could not prove the shape of your vite config. Add the plugin yourself. Full steps: https://conciv.dev/docs/quick-start/vite',
            snippet: quickStartSnippet,
          },
        ],
      },
    ])
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('cards a config whose only plugins array sits outside the export and leaves the file alone', async () => {
    const {cwd, detected, settings, output} = project('vite.config.foreign-plugins.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const ledger = await runSteps([viteStep(detected)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(ledger[0]?.cards[0]?.snippet).toBe(quickStartSnippet)
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('treats a lone plugin import as unwired and lands the call', async () => {
    const {cwd, detected, ctx} = project('vite.config.import-only.ts')
    const step = viteStep(detected)
    expect(await step.detect(ctx)).toBe('missing')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    const written = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    expect(written).toContain('plugins: [conciv()]')
    expect(await step.verify(ctx)).toBe(true)
  })

  it('cards a config that imports something else from the plugin module and leaves the file alone', async () => {
    const {cwd, detected, settings, output} = project('vite.config.foreign-import.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const ledger = await runSteps([viteStep(detected)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(ledger[0]?.cards[0]?.snippet).toBe(quickStartSnippet)
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('cards a conciv() call bound to another module instead of reading it as wired', async () => {
    const {cwd, detected, ctx, settings, output} = project('vite.config.foreign-binding.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    expect(await viteStep(detected).detect(ctx)).toBe('missing')
    const ledger = await runSteps([viteStep(detected)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('cards when the project has no config file', async () => {
    const {detected, ctx} = project(null)
    const outcome = await viteStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards[0]?.snippet).toBe(quickStartSnippet)
  })

  it('dry-run plans without touching the file', async () => {
    const {cwd, detected, events, settings, output} = project('vite.config.react.ts')
    const before = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    const ledger = await runSteps([viteStep(detected)], {...settings, dryRun: true}, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(events.join('\n')).toContain('vite.config.ts')
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).toBe(before)
  })

  it('remembers the original config so an interrupted run can restore it', async () => {
    const {cwd, detected, backups, ctx} = project('vite.config.react.ts')
    const original = readFileSync(join(cwd, 'vite.config.ts'), 'utf8')
    expect(await viteStep(detected).apply(ctx)).toEqual({status: 'done'})
    expect(backups).toEqual([{path: join(cwd, 'vite.config.ts'), content: original}])
    expect(readFileSync(join(cwd, 'vite.config.ts'), 'utf8')).not.toBe(original)
  })
})
