import {describe, expect, test} from 'vitest'
import {Command, type Registry} from '@conciv/plugin/experimental'
import {pluginDefinition} from './module'

const bundle = `
const sdk = require("@conciv/plugin/experimental")
const solid = require("solid-js")
const fs = require("node:fs")
const notes = fs.readFileSync("notes.json")
exports.default = sdk.Plugin.define({
  setup(ctx) {
    const [count] = solid.createSignal(1)
    ctx.add(sdk.Command, { id: "open", title: "Notes" + count(), run() {} })
    return () => ctx.add(sdk.Command, { id: "closed", title: "", run() {} })
  },
})
`

describe('plugin bundles in the page', () => {
  test("declare their definition before they start, with the app's module instances and Node built-ins inert", async () => {
    const definition = await pluginDefinition('acme', bundle)
    const added: {readonly registry: Registry<Command>; readonly item: Command}[] = []

    expect(definition.id).toBe('acme')

    const entry = await definition.windowEntry?.()

    const ctx = {
      add: (registry: Registry<Command>, item: Command) => void added.push({registry, item}),
    }

    const cleanup = entry?.default(ctx as never)

    expect(added[0]?.registry).toBe(Command)
    expect(added[0]?.item).toMatchObject({id: 'open', title: 'Notes1'})
    expect(cleanup).toBeTypeOf('function')
  })

  test('fail only their own entry when they require a module the app does not share', async () => {
    const definition = await pluginDefinition('acme', 'require("left-pad"); exports.default = { setup() {} }')

    expect(definition.id).toBe('acme')
    await expect(definition.windowEntry?.()).rejects.toThrow('left-pad')
  })
})
