import {describe, expect, it} from 'vitest'
import {cli} from '@conciv/plugin-testkit'
import cliManifest from '../package.json' with {type: 'json'}

describe('help', () => {
  it('help lists the commands and exits 0', async () => {
    const run = await cli(['--help'])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain('Usage:\n  conciv [OPTIONS] <COMMAND>')
    expect(run.stdout).toMatch(/^ {2}tools {3}inspect & drive the live dev server/m)
    expect(run.stdout).toMatch(/^ {2}init {4}Set this project up for conciv/m)
    expect(run.stdout).toMatch(/^ {2}auth {4}Manage the browsers trusted by the conciv engine\./m)
    expect(run.stdout).toMatch(/^ {2}plugin {2}Call the RPC methods a plugin registered/m)
  })

  it.each([['--version'], ['-v']])('%s prints the version and exits 0', async (flag) => {
    const run = await cli([flag])

    expect(run).toMatchObject({exitCode: 0, stdout: `conciv ${cliManifest.version}\n`})
  })
})
