import {describe, expect, it} from 'vitest'
import {createEngine} from '@conciv/core/testing'
import {cli} from '../test/cli.js'

describe('tools', () => {
  it("the plugin's group is listed, its verb runs with flags spelled from its schema, and a mistyped verb gets a fix", async () => {
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
  })
})
