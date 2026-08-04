import {mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {Detected, Framework} from '../../../src/init/detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {fallbackStep} from '../../../src/init/steps/framework/fallback.js'
import {webpackFamilyStep} from '../../../src/init/steps/framework/webpack-family.js'
import {stepContext} from './step-context.js'

const fixturesDir = join(import.meta.dirname, '..', '..', 'fixtures')

type Project = {cwd: string; detected: Detected} & ReturnType<typeof stepContext>

function project(framework: Framework, configFile: string | null, fixtureName: string | null): Project {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-webpack-family-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: 'app', devDependencies: {[framework]: '^1.0.0'}}))
  if (configFile !== null && fixtureName !== null) {
    writeFileSync(join(cwd, configFile), readFileSync(join(fixturesDir, fixtureName), 'utf8'))
  }
  const detected: Detected = {framework, configFile, packageManager: 'pnpm'}
  return {cwd, detected, ...stepContext(cwd)}
}

describe('webpackFamilyStep', () => {
  it('wires a CJS webpack config with a require line and conciv.default(), still carding widgetUrl', async () => {
    const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.cjs.js')
    const step = webpackFamilyStep(detected)
    expect(step.id).toBe('framework')
    expect(await step.detect(ctx)).toBe('missing')
    const outcome = await step.apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards.map((card) => card.title)).toEqual(['Inject the widget'])
    expect(outcome.cards[0]?.body).toContain('@conciv/widget/global')
    expect(outcome.cards[0]?.body).toContain('widgetUrl')
    const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
    expect(written).toContain("const conciv = require('@conciv/it/plugin/webpack')")
    expect(written).toContain('plugins: [new DefinePlugin({DEV: true}), conciv.default()],')
    expect(await step.detect(ctx)).toBe('present')
  })

  it('reports already on the second pipeline run over a wired CJS config', async () => {
    const {detected, settings, output} = project('webpack', 'webpack.config.js', 'webpack.config.cjs.js')
    const first = await runSteps([webpackFamilyStep(detected)], settings, output)
    expect(first.map((entry) => entry.status)).toEqual(['manual'])
    const second = await runSteps([webpackFamilyStep(detected)], settings, output)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
  })

  it('wires an ESM webpack config through the engine with a default import', async () => {
    const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.esm.js')
    const outcome = await webpackFamilyStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards.map((card) => card.title)).toEqual(['Inject the widget'])
    const written = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
    expect(written).toContain("import conciv from '@conciv/it/plugin/webpack'")
    expect(written).toContain('plugins: [new TerserPlugin(), conciv()],')
  })

  it('picks the rspack module path for rspack projects', async () => {
    const {cwd, detected, ctx} = project('rspack', 'rspack.config.js', 'rspack.config.esm.js')
    const outcome = await webpackFamilyStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    const written = readFileSync(join(cwd, 'rspack.config.js'), 'utf8')
    expect(written).toContain("import conciv from '@conciv/it/plugin/rspack'")
    expect(written).toContain('plugins: [conciv()],')
    expect(outcome.cards[0]?.body).toContain('rspack')
  })

  it('cards a CJS config without a plugins array and leaves the file byte-identical', async () => {
    const {cwd, detected, ctx} = project('webpack', 'webpack.config.js', 'webpack.config.cjs-no-plugins.js')
    const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
    const outcome = await webpackFamilyStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards.map((card) => card.title)).toEqual(['Wire the conciv webpack plugin', 'Inject the widget'])
    expect(outcome.cards[0]?.snippet).toBe(`const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  plugins: [conciv.default()],
}`)
    expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
  })

  it('cards when the project has no config file', async () => {
    const {detected, ctx} = project('rspack', null, null)
    const outcome = await webpackFamilyStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards.map((card) => card.title)).toEqual(['Wire the conciv rspack plugin', 'Inject the widget'])
    expect(outcome.cards[0]?.snippet).toContain("require('@conciv/it/plugin/rspack')")
  })

  it('dry-run plans without touching the file', async () => {
    const {cwd, detected, events, settings, output} = project('webpack', 'webpack.config.js', 'webpack.config.cjs.js')
    const before = readFileSync(join(cwd, 'webpack.config.js'), 'utf8')
    const ledger = await runSteps([webpackFamilyStep(detected)], {...settings, dryRun: true}, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['skipped'])
    expect(events.join('\n')).toContain('webpack.config.js')
    expect(readFileSync(join(cwd, 'webpack.config.js'), 'utf8')).toBe(before)
  })
})

describe('fallbackStep', () => {
  it('cards a rollup project with the build-only caveat and writes nothing', async () => {
    const {cwd, detected, settings, output} = project('rollup', 'rollup.config.mjs', 'rollup.config.basic.mjs')
    const filesBefore = readdirSync(cwd).toSorted()
    const configBefore = readFileSync(join(cwd, 'rollup.config.mjs'), 'utf8')
    const ledger = await runSteps([fallbackStep(detected)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    const card = ledger[0]?.cards[0]
    expect(card?.body).toContain('@conciv/it/plugin/rollup')
    expect(card?.body).toContain('build-only no-op')
    expect(card?.body).toContain('Vite uses Rollup under the hood')
    expect(readdirSync(cwd).toSorted()).toEqual(filesBefore)
    expect(readFileSync(join(cwd, 'rollup.config.mjs'), 'utf8')).toBe(configBefore)
  })

  it('cards an esbuild project with the build-only caveat', async () => {
    const {detected, ctx} = project('esbuild', null, null)
    const outcome = await fallbackStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards[0]?.body).toContain('@conciv/it/plugin/esbuild')
    expect(outcome.cards[0]?.body).toContain('build-only no-op')
  })

  it('cards an unknown project with the vite quick-start snippet', async () => {
    const {cwd, detected, ctx} = project('unknown', null, null)
    const filesBefore = readdirSync(cwd).toSorted()
    const outcome = await fallbackStep(detected).apply(ctx)
    if (outcome.status !== 'manual') throw new Error('expected a manual outcome')
    expect(outcome.cards[0]?.snippet).toBe(`import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`)
    expect(readdirSync(cwd).toSorted()).toEqual(filesBefore)
  })
})
