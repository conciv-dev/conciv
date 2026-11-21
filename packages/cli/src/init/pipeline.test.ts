import {cpSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {cli} from '@conciv/plugin-testkit'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('dry run', () => {
  it('a vite project gets its plan and nothing is written', async () => {
    const project = tempDir('vite-shop-')
    cpSync(join(import.meta.dirname, '../../test/fixtures/vite-shop'), project, {recursive: true})

    const planned = await cli(['init', '--dry-run', '--json', '--force'], {cwd: project})

    expect(planned.exitCode).toBe(0)
    expect(JSON.parse(planned.stdout)).toEqual({
      ok: true,
      data: {
        dryRun: true,
        plan: expect.stringMatching(/^Install @conciv\/it +package\.json\nWire the vite config +vite\.config\.ts\n/),
      },
    })
    expect(readdirSync(project).toSorted()).toEqual(['package.json', 'vite.config.ts'])
  })

  it('a run without --yes in a non-interactive terminal is refused and nothing is written', async () => {
    const project = tempDir('vite-shop-')
    cpSync(join(import.meta.dirname, '../../test/fixtures/vite-shop'), project, {recursive: true})

    const run = await cli(['init', '--json', '--force'], {cwd: project})

    expect(run.exitCode).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: 'Non-interactive terminal — re-run with --yes or --dry-run',
        hint: 'nothing was written',
      },
    })
    expect(readdirSync(project).toSorted()).toEqual(['package.json', 'vite.config.ts'])
  })

  it('a folder with no package.json is refused and nothing is written', async () => {
    const empty = tempDir('empty-')

    const run = await cli(['init', '--dry-run', '--json', '--force'], {cwd: empty})

    expect(run.exitCode).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: 'no package.json here — run init from your app directory',
        hint: 'nothing was written',
      },
    })
    expect(readdirSync(empty)).toEqual([])
  })
})
