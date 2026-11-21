import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {cli} from '@conciv/plugin-testkit'

describe('dry run', () => {
  it('a vite project gets its plan and nothing is written', async () => {
    const project = join(import.meta.dirname, '../../test/fixtures/vite-shop')

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

  it.each([
    {
      args: ['init', '--json', '--force'],
      folder: 'vite-shop',
      message: 'Non-interactive terminal \u2014 re-run with --yes or --dry-run',
    },
    {
      args: ['init', '--dry-run', '--json', '--force'],
      folder: '',
      message: 'no package.json here \u2014 run init from your app directory',
    },
  ])('$message: refused, nothing written', async ({args, folder, message}) => {
    const run = await cli(args, {cwd: join(import.meta.dirname, '../../test/fixtures', folder)})

    expect(run.exitCode).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({ok: false, error: {kind: 'user', message, hint: 'nothing was written'}})
  })
})
