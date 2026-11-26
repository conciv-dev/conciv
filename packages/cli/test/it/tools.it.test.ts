import {describe, expect} from 'vitest'
import {test as it} from '@conciv/backend-test-utils'
import page from '@conciv/plugin-page'
import {cli} from '../utils/cli.js'

describe('tools', () => {
  it("the plugin's group is listed, its verb runs with flags spelled from its schema, a mistyped verb gets a fix, a page tool with no page open answers that no page is open, and a plugin rpc method runs through plugin call", async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})

    const help = await cli(['tools', '--help'], {engine})
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toMatch(/^ {2}shelf +the shelf tools the running dev server serves/m)

    const groupHelp = await cli(['tools', 'shelf', '--help'], {engine})
    expect(groupHelp.stdout).toMatch(/^ {2}label +Print a label for a plant on the shelf/m)
    expect(groupHelp.stdout).toMatch(/^ {2}restock +Restock a plant on the shelf/m)

    const plain = await cli(['tools', 'shelf', 'label', 'fern'], {engine})
    expect(plain.exitCode).toBe(0)
    expect(JSON.parse(plain.stdout)).toEqual({ok: true, data: {plant: 'fern'}})

    const flagged = await cli(['tools', 'shelf', 'label', 'fern', '--pots', '2', '--sunny', '--pot-color', 'red'], {
      engine,
    })
    expect(JSON.parse(flagged.stdout)).toEqual({ok: true, data: {plant: 'fern', pots: 2, sunny: true, potColor: 'red'}})

    const camel = await cli(['tools', 'shelf', 'label', 'fern', '--potColor', 'blue'], {engine})
    expect(JSON.parse(camel.stdout)).toEqual({ok: true, data: {plant: 'fern', potColor: 'blue'}})

    const mistyped = await cli(['tools', 'shelf', 'lable', 'fern'], {engine})
    expect(mistyped.exitCode).toBe(1)
    expect(JSON.parse(mistyped.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: "Unknown command 'lable' for conciv tools shelf. Did you mean 'label'?",
        hint: 'run conciv tools shelf --help to list its commands',
      },
    })

    const paged = await createEngine({}, {plugins: [page]})
    const pageHelp = await cli(['tools', '--help'], {engine: paged})
    expect(pageHelp.stdout).toMatch(/^ {2}page +the page tools the running dev server serves/m)
    const noPage = await cli(['tools', 'page', 'route'], {engine: paged})
    expect(noPage.exitCode).toBe(1)
    expect(JSON.parse(noPage.stdout)).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('No tool named "page_route" is currently available')},
    })

    const routed = await createEngine({plugins: ['@conciv/plugin-tanstack']})
    await routed.write('src/routes/plants.$plantId.tsx', 'export const Route = {}\n')
    await routed.write(
      'src/routeTree.gen.ts',
      [
        "import { Route as rootRouteImport } from './routes/__root'",
        "import { Route as PlantsPlantIdRouteImport } from './routes/plants.$plantId'",
        'const PlantsPlantIdRoute = PlantsPlantIdRouteImport.update({',
        "  id: '/plants/$plantId',",
        "  path: '/plants/$plantId',",
        '  getParentRoute: () => rootRouteImport,',
        '} as any)',
        '',
      ].join('\n'),
    )
    const manifest = await routed.rpc.call('experimental.tanstack', 'routeManifest')
    const called = await cli(['plugin', 'call', 'experimental.tanstack', 'routeManifest'], {engine: routed})
    expect(called.exitCode).toBe(0)
    expect(JSON.parse(called.stdout)).toEqual({ok: true, data: manifest})
    expect(manifest).toMatchObject([
      {path: '/', kind: 'layout'},
      {path: '/plants/$plantId', kind: 'page', dynamic: true},
    ])
  })
})
