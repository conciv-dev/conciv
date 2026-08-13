import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {InitContext} from '../../src/init/pipeline.js'
import {docsPackStep} from '../../src/init/steps/docs-pack.js'

function project(manifest: object): InitContext {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-docs-pack-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
  return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}}
}

describe('docsPackStep', () => {
  it('detects present and missing from the real package.json', async () => {
    const step = docsPackStep(
      async () => {},
      async () => ({code: 0, output: ''}),
    )
    expect(await step.detect(project({devDependencies: {'@conciv/skills': '^0.0.19'}}))).toBe('present')
    expect(await step.detect(project({name: 'app'}))).toBe('missing')
  })

  it('adds the dependency and runs intent install, landing the dep and verifying', async () => {
    const ctx = project({name: 'app'})
    const spawned: {bin: string; args: string[]; cwd: string}[] = []
    const step = docsPackStep(
      async (name, opts) => {
        const manifestPath = join(opts.cwd, 'package.json')
        writeFileSync(manifestPath, JSON.stringify({name: 'app', devDependencies: {[name]: '^0.0.19'}}))
      },
      async (bin, args, cwd) => {
        spawned.push({bin, args, cwd})
        return {code: 0, output: ''}
      },
    )
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    expect(spawned).toEqual([{bin: 'pnpm', args: ['dlx', '@tanstack/intent@latest', 'install'], cwd: ctx.cwd}])
    const written: unknown = JSON.parse(readFileSync(join(ctx.cwd, 'package.json'), 'utf8'))
    expect(written).toEqual({name: 'app', devDependencies: {'@conciv/skills': '^0.0.19'}})
  })

  it('a throwing add degrades to manual with both commands on the card', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
    const step = docsPackStep(
      async () => {
        throw new Error('registry unreachable')
      },
      async () => ({code: 0, output: ''}),
    )
    const outcome = await step.apply(ctx)
    expect(outcome).toEqual({
      status: 'manual',
      detail: 'registry unreachable',
      cards: [
        {
          title: 'Add the @conciv/skills docs pack',
          body: 'The automatic setup failed. Run these in your project:',
          snippet: 'pnpm add --save-dev @conciv/skills\npnpm dlx @tanstack/intent@latest install',
        },
      ],
    })
    expect(await step.verify(ctx)).toBe(false)
  })

  it('a failing intent install spawn degrades to manual once the dependency already landed', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
    const step = docsPackStep(
      async (name, opts) => {
        const manifestPath = join(opts.cwd, 'package.json')
        writeFileSync(
          manifestPath,
          JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
        )
      },
      async () => ({code: 1, output: 'intent: network error'}),
    )
    const outcome = await step.apply(ctx)
    expect(outcome).toEqual({
      status: 'manual',
      detail: 'intent: network error',
      cards: [
        {
          title: 'Add the @conciv/skills docs pack',
          body: 'The automatic setup failed. Run these in your project:',
          snippet: 'pnpm add --save-dev @conciv/skills\npnpm dlx @tanstack/intent@latest install',
        },
      ],
    })
    expect(await step.detect(ctx)).toBe('present')
  })
})
