import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {dlxCommand} from 'nypm'
import {describe, expect, it} from 'vitest'
import {guardBackups} from '../../src/init/interrupt.js'
import type {InitContext} from '../../src/init/pipeline.js'
import {docsPackStep} from '../../src/init/steps/docs-pack.js'

const intentBlock = '<!-- intent-skills:start -->\nguidance\n<!-- intent-skills:end -->\n'
const intentStartOnly = '<!-- intent-skills:start -->\nguidance, no end marker\n'

function project(manifest: object, feed: (line: string) => void = () => {}): InitContext {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-docs-pack-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
  return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}, feed}
}

describe('docsPackStep', () => {
  it('detects present only once the dependency and the intent guidance block both exist', async () => {
    const step = docsPackStep(
      async () => {},
      async () => ({code: 0, output: ''}),
    )
    expect(await step.detect(project({name: 'app'}))).toBe('missing')
    const withDepOnly = project({devDependencies: {'@conciv/skills': '^0.0.19'}})
    expect(await step.detect(withDepOnly)).toBe('missing')
    writeFileSync(join(withDepOnly.cwd, 'AGENTS.md'), intentBlock)
    expect(await step.detect(withDepOnly)).toBe('present')
  })

  it('does not treat a lone start marker as an installed block', async () => {
    const step = docsPackStep(
      async () => {},
      async () => ({code: 0, output: ''}),
    )
    const ctx = project({devDependencies: {'@conciv/skills': '^0.0.19'}})
    writeFileSync(join(ctx.cwd, 'AGENTS.md'), intentStartOnly)
    expect(await step.detect(ctx)).toBe('missing')
  })

  it('backs up AGENTS.md before the intent spawn so an interrupt restores its pre-run content', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {'@conciv/skills': '^0.0.19'}})
    const original = '# my project\n\nhand-written rules stay put.\n'
    writeFileSync(join(ctx.cwd, 'AGENTS.md'), original)
    const guard = guardBackups()
    const contextWithGuard: InitContext = {...ctx, backup: guard.remember}
    const step = docsPackStep(
      async () => {},
      async (_bin, _args, cwd) => {
        writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
        return {code: 0, output: ''}
      },
    )
    const outcome = await step.apply(contextWithGuard)
    expect(outcome).toEqual({status: 'done'})
    expect(readFileSync(join(ctx.cwd, 'AGENTS.md'), 'utf8')).toBe(intentBlock)
    guard.restore()
    guard.release()
    expect(readFileSync(join(ctx.cwd, 'AGENTS.md'), 'utf8')).toBe(original)
  })

  it('adds the dependency and runs intent install, landing the dep and verifying', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'})
    const spawned: {bin: string; args: string[]; cwd: string}[] = []
    const step = docsPackStep(
      async (name, opts) => {
        const manifestPath = join(opts.cwd, 'package.json')
        writeFileSync(
          manifestPath,
          JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
        )
      },
      async (bin, args, cwd) => {
        spawned.push({bin, args, cwd})
        writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
        return {code: 0, output: ''}
      },
    )
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    expect(await step.detect(ctx)).toBe('present')
    expect(await step.verify(ctx)).toBe(true)
    expect(spawned).toEqual([{bin: 'pnpm', args: ['dlx', '@tanstack/intent@latest', 'install'], cwd: ctx.cwd}])
    const written: unknown = JSON.parse(readFileSync(join(ctx.cwd, 'package.json'), 'utf8'))
    expect(written).toEqual({
      name: 'app',
      packageManager: 'pnpm@10.14.0',
      devDependencies: {'@conciv/skills': '^0.0.19'},
    })
  })

  it('an already-present dependency skips the add call but still runs intent install for a missing block', async () => {
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {'@conciv/skills': '^0.0.19'}})
    let addCalled = false
    const spawned: {bin: string; args: string[]; cwd: string}[] = []
    const step = docsPackStep(
      async () => {
        addCalled = true
      },
      async (bin, args, cwd) => {
        spawned.push({bin, args, cwd})
        writeFileSync(join(cwd, 'AGENTS.md'), intentBlock)
        return {code: 0, output: ''}
      },
    )
    expect(await step.detect(ctx)).toBe('missing')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    expect(addCalled).toBe(false)
    expect(spawned).toEqual([{bin: 'pnpm', args: ['dlx', '@tanstack/intent@latest', 'install'], cwd: ctx.cwd}])
    expect(await step.verify(ctx)).toBe(true)
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

  it('a failing intent install spawn degrades to manual once the dependency already landed, card omits the add line', async () => {
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
          snippet: 'pnpm dlx @tanstack/intent@latest install',
        },
      ],
    })
    expect(await step.detect(ctx)).toBe('missing')
  })

  it('streams spawned intent-install lines into the step feed while the manual card keeps the full output', async () => {
    const fed: string[] = []
    const ctx = project({name: 'app', packageManager: 'pnpm@10.14.0'}, (line) => fed.push(line))
    const step = docsPackStep(
      async (name, opts) => {
        const manifestPath = join(opts.cwd, 'package.json')
        writeFileSync(
          manifestPath,
          JSON.stringify({name: 'app', packageManager: 'pnpm@10.14.0', devDependencies: {[name]: '^0.0.19'}}),
        )
      },
      async (_bin, _args, _cwd, onLine) => {
        onLine('resolving intent skill…')
        onLine('installed 1 package')
        return {code: 1, output: 'resolving intent skill…\ninstalled 1 package'}
      },
    )
    const outcome = await step.apply(ctx)
    expect(fed).toEqual(['resolving intent skill…', 'installed 1 package'])
    expect(outcome).toMatchObject({status: 'manual', detail: 'resolving intent skill…\ninstalled 1 package'})
  })

  it('uses the detected package manager for npm projects, not a hardcoded pnpm command', async () => {
    const ctx = project({name: 'app'})
    writeFileSync(join(ctx.cwd, 'package-lock.json'), JSON.stringify({name: 'app', lockfileVersion: 3}))
    const spawned: {bin: string; args: string[]; cwd: string}[] = []
    const step = docsPackStep(
      async (name, opts) => {
        const manifestPath = join(opts.cwd, 'package.json')
        writeFileSync(manifestPath, JSON.stringify({name: 'app', devDependencies: {[name]: '^0.0.19'}}))
      },
      async (bin, args, cwd) => {
        spawned.push({bin, args, cwd})
        return {code: 1, output: 'intent: still missing'}
      },
    )
    const outcome = await step.apply(ctx)
    const expectedCommand = dlxCommand('npm', '@tanstack/intent@latest', {args: ['install']})
    const [expectedBin, ...expectedArgs] = expectedCommand.split(' ')
    expect(spawned).toEqual([{bin: expectedBin, args: expectedArgs, cwd: ctx.cwd}])
    expect(outcome).toEqual({
      status: 'manual',
      detail: 'intent: still missing',
      cards: [
        {
          title: 'Add the @conciv/skills docs pack',
          body: 'The automatic setup failed. Run these in your project:',
          snippet: expectedCommand,
        },
      ],
    })
  })
})
