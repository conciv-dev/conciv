import {execFileSync} from 'node:child_process'
import {cpSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {cli} from '../utils/cli.js'
import {tempDir} from '@internal/vitest-config/temp-dir'

describe('dry run', () => {
  it.each([
    {
      fixture: 'vite-shop',
      files: ['package.json', 'vite.config.ts'],
      plan: /^Install @conciv\/it +package\.json\nWire the vite config +vite\.config\.ts\n/,
    },
    {
      fixture: 'next-shop',
      files: ['next.config.mjs', 'package.json'],
      plan: /^Install @conciv\/it +package\.json\nWire next\.js +next\.config\.mjs, instrumentation\.ts, instrumentation-client\.ts\n/,
    },
    {
      fixture: 'next-src-shop',
      files: ['next.config.mjs', 'package.json', 'src'],
      plan: /^Install @conciv\/it +package\.json\nWire next\.js +next\.config\.mjs, src\/instrumentation\.ts, src\/instrumentation-client\.ts\n/,
    },
    {
      fixture: 'webpack-shop',
      files: ['package.json', 'webpack.config.js'],
      plan: /^Install @conciv\/it +package\.json\nWire the webpack config +webpack\.config\.js\n/,
    },
    {
      fixture: 'rspack-shop',
      files: ['package.json', 'rspack.config.js'],
      plan: /^Install @conciv\/it +package\.json\nWire the rspack config +rspack\.config\.js\n/,
    },
  ])('a $fixture project gets its own plan and nothing is written', async ({fixture, files, plan}) => {
    const project = tempDir(`${fixture}-`)
    cpSync(join(import.meta.dirname, '..', 'fixtures', fixture), project, {recursive: true})

    const planned = await cli(['init', '--dry-run', '--json', '--force'], {cwd: project})

    expect(planned.exitCode).toBe(0)
    expect(JSON.parse(planned.stdout)).toEqual({ok: true, data: {dryRun: true, plan: expect.stringMatching(plan)}})
    expect(readdirSync(project).toSorted()).toEqual(files)
  })

  it.each([
    {
      refused: 'a run without --yes in a non-interactive terminal',
      fixture: true,
      git: false,
      args: ['init', '--json', '--force'],
      message: 'Non-interactive terminal: re-run with --yes or --dry-run',
      files: ['package.json', 'vite.config.ts'],
    },
    {
      refused: 'a folder with no package.json',
      fixture: false,
      git: false,
      args: ['init', '--dry-run', '--json', '--force'],
      message: 'no package.json here: run init from your app directory',
      files: [],
    },
    {
      refused: 'a project with uncommitted changes',
      fixture: true,
      git: true,
      args: ['init', '--dry-run', '--json'],
      message: 'uncommitted changes: commit first or pass --force',
      files: ['.git', 'package.json', 'vite.config.ts'],
    },
  ])('$refused is refused and nothing is written', async ({fixture, git, args, message, files}) => {
    const project = tempDir('init-refused-')
    if (fixture) cpSync(join(import.meta.dirname, '..', 'fixtures', 'vite-shop'), project, {recursive: true})
    if (git) execFileSync('git', ['init', '--quiet'], {cwd: project})

    const run = await cli(args, {cwd: project})

    expect(run.exitCode).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({ok: false, error: {kind: 'user', message, hint: 'nothing was written'}})
    expect(readdirSync(project).toSorted()).toEqual(files)
  })
})
