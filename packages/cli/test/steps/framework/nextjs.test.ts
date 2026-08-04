import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {Detected} from '../../../src/init/detect.js'
import type {InitContext} from '../../../src/init/pipeline.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {nextjsStep} from '../../../src/init/steps/framework/nextjs.js'

const fixturesDir = join(import.meta.dirname, '..', '..', 'fixtures')

const instrumentationContent = "export {register} from '@conciv/it/plugin/nextjs'\n"
const clientContent = "import '@conciv/it/plugin/nextjs/widget'\n"

function project(fixtureName: string | null): {cwd: string; detected: Detected; reports: string[]; ctx: InitContext} {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-nextjs-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: 'app', dependencies: {next: '^15.0.0'}}))
  const configFile = fixtureName === null ? null : 'next.config.ts'
  if (fixtureName !== null) {
    writeFileSync(join(cwd, 'next.config.ts'), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
  }
  const detected: Detected = {framework: 'nextjs', configFile, packageManager: 'pnpm'}
  const reports: string[] = []
  const ctx: InitContext = {cwd, yes: true, dryRun: false, report: (line) => reports.push(line)}
  return {cwd, detected, reports, ctx}
}

describe('nextjsStep', () => {
  it('lands all three wires on a fresh project with exact instrumentation contents', async () => {
    const {cwd, detected, reports, ctx} = project('next.config.ts')
    const step = nextjsStep(detected)
    expect(step.id).toBe('framework')
    expect(await step.detect(ctx)).toBe('missing')
    const ledger = await runSteps([step], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
    expect(config).toContain("import {withConciv} from '@conciv/it/plugin/nextjs'")
    expect(config).toContain('export default withConciv(nextConfig)')
    expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
    expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    const diff = reports.join('\n')
    expect(diff).toContain('--- next.config.ts')
    expect(diff).toContain('+export default withConciv(nextConfig)')
  })

  it('reports already on the second run through the pipeline', async () => {
    const {detected, ctx} = project('next.config.ts')
    const first = await runSteps([nextjsStep(detected)], ctx)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const second = await runSteps([nextjsStep(detected)], ctx)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
  })

  it('cards a pre-existing custom instrumentation.ts while the other wires still land', async () => {
    const {cwd, detected, ctx} = project('next.config.ts')
    const custom = "export function register() {\n  console.log('mine')\n}\n"
    writeFileSync(join(cwd, 'instrumentation.ts'), custom)
    const ledger = await runSteps([nextjsStep(detected)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    const entry = ledger[0]
    if (!entry) throw new Error('expected a ledger entry')
    expect(entry.cards).toHaveLength(1)
    expect(entry.cards[0]?.title).toContain('instrumentation.ts')
    expect(entry.cards[0]?.snippet).toBe("export {register} from '@conciv/it/plugin/nextjs'")
    expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(custom)
    const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
    expect(config).toContain('export default withConciv(nextConfig)')
    expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
  })

  it('re-runs only the remaining wires when the config is already wrapped', async () => {
    const {cwd, detected, ctx} = project('next.config.ts')
    const first = await runSteps([nextjsStep(detected)], ctx)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const wiredConfig = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
    writeFileSync(join(cwd, 'instrumentation-client.ts'), '')
    const step = nextjsStep(detected)
    expect(await step.detect(ctx)).toBe('missing')
    const outcome = await step.apply(ctx)
    expect(outcome.status).toBe('manual')
    expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(wiredConfig)
    expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
  })

  it('wraps a foreign-wrapped config outside-in', async () => {
    const {cwd, detected, ctx} = project('next.config.wrapped.ts')
    const ledger = await runSteps([nextjsStep(detected)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const config = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
    expect(config).toContain('export default withConciv(withSentry(nextConfig))')
  })

  it('cards the config wire when there is no config file and still writes instrumentation', async () => {
    const {cwd, detected, ctx} = project(null)
    const ledger = await runSteps([nextjsStep(detected)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(ledger[0]?.cards).toHaveLength(1)
    expect(ledger[0]?.cards[0]?.title).toContain('config')
    expect(readFileSync(join(cwd, 'instrumentation.ts'), 'utf8')).toBe(instrumentationContent)
    expect(readFileSync(join(cwd, 'instrumentation-client.ts'), 'utf8')).toBe(clientContent)
  })

  it('dry-run plans without touching anything', async () => {
    const {cwd, detected, reports, ctx} = project('next.config.ts')
    const before = readFileSync(join(cwd, 'next.config.ts'), 'utf8')
    const dryCtx: InitContext = {...ctx, dryRun: true}
    const ledger = await runSteps([nextjsStep(detected)], dryCtx)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(reports.join('\n')).toContain('next.config.ts')
    expect(readFileSync(join(cwd, 'next.config.ts'), 'utf8')).toBe(before)
    expect(existsSync(join(cwd, 'instrumentation.ts'))).toBe(false)
    expect(existsSync(join(cwd, 'instrumentation-client.ts'))).toBe(false)
  })
})
