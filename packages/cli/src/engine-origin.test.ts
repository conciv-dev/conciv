import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {cli, createEngine} from '@conciv/plugin-testkit'

describe('discovery', () => {
  it('the engine in the environment wins, then server.json found from a subfolder, else the no-server hint', async () => {
    const project = await createEngine()
    const other = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})
    await project.write('src/app/main.ts', 'export {}\n')

    const fromEnv = await cli(['tools', '--help'], {cwd: project.root, engine: other})
    expect(fromEnv.exitCode).toBe(0)
    expect(fromEnv.stdout).toMatch(/^ {2}shelf +the shelf tools the running dev server serves/m)

    const fromSubfolder = await cli(['tools', '--help'], {cwd: join(project.root, 'src', 'app')})
    expect(fromSubfolder.exitCode).toBe(0)
    expect(fromSubfolder.stdout).toMatch(/^ {2}page +the page tools the running dev server serves/m)
    expect(fromSubfolder.stdout).not.toMatch(/^ {2}shelf /m)

    const nowhere = await cli(['tools', '--help'])
    expect(nowhere.exitCode).toBe(1)
    expect(JSON.parse(nowhere.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: expect.stringMatching(/^No conciv dev server on 127\.0\.0\.1:\d+\.$/),
        hint: "Start your app (pnpm dev). conciv reads the engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port, not Vite's).",
      },
    })
  })
})
