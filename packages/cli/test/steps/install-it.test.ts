import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {InitContext} from '../../src/init/pipeline.js'
import {hasIt, installItStep} from '../../src/init/steps/install-it.js'

function project(manifest: object): InitContext {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-install-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
  return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}, feed: () => {}}
}

describe('hasIt', () => {
  it('sees @conciv/it in dependencies', () => {
    expect(hasIt({dependencies: {'@conciv/it': '^0.0.17'}})).toBe(true)
  })
  it('sees @conciv/it in devDependencies', () => {
    expect(hasIt({devDependencies: {'@conciv/it': '^0.0.17'}})).toBe(true)
  })
  it('reports missing otherwise', () => {
    expect(hasIt({dependencies: {vite: '^7.0.0'}})).toBe(false)
    expect(hasIt({})).toBe(false)
  })
})

describe('installItStep', () => {
  it('detects present and missing from the real package.json', async () => {
    const step = installItStep(async () => {}, 'pnpm')
    expect(await step.detect(project({devDependencies: {'@conciv/it': '^0.0.17'}}))).toBe('present')
    expect(await step.detect(project({name: 'app'}))).toBe('missing')
  })

  it('apply with a recording add lands the dep, flips detect, and verifies', async () => {
    const ctx = project({name: 'app'})
    const step = installItStep(async (name, opts) => {
      const manifestPath = join(opts.cwd, 'package.json')
      writeFileSync(manifestPath, JSON.stringify({name: 'app', devDependencies: {[name]: '^0.0.17'}}))
    }, 'pnpm')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    const written: unknown = JSON.parse(readFileSync(join(ctx.cwd, 'package.json'), 'utf8'))
    expect(written).toEqual({name: 'app', devDependencies: {'@conciv/it': '^0.0.17'}})
  })

  it('a throwing add degrades to manual with the pnpm add command on the card', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
    const step = installItStep(async () => {
      throw new Error('registry unreachable')
    }, 'pnpm')
    const outcome = await step.apply(ctx)
    expect(outcome).toEqual({
      status: 'manual',
      detail: 'registry unreachable',
      cards: [
        {
          title: 'Install @conciv/it',
          body: 'The automatic install failed. Run this in your project:',
          snippet: 'pnpm add --save-dev @conciv/it',
        },
      ],
    })
    expect(await step.verify(ctx)).toBe(false)
  })
})
