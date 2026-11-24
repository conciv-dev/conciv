import {tmpdir} from 'node:os'
import {describe, expect} from 'vitest'
import {test as it} from '@conciv/core/testing'
import {cli} from './testing.js'

describe('discovery', () => {
  it('with no environment and no server.json, the engine registered in the home is found', async ({createEngine}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})

    const fromHome = await cli(['tools', '--help'], {cwd: tmpdir(), env: {CONCIV_HOME: engine.home}})
    expect(fromHome.exitCode).toBe(0)
    expect(fromHome.stdout).toMatch(/^ {2}shelf +the shelf tools the running dev server serves/m)
  })
})
