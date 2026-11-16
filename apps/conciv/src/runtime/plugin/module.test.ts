import {describe, expect, test} from 'vitest'
import * as Effect from 'effect'
import {Command, type Registry} from '@conciv/plugin/experimental'
import {pluginDefinition} from './module'

const bundle = `
const sdk = require("@conciv/plugin/experimental")
const solid = require("solid-js")
const effect = require("effect")
const fs = require("node:fs")
const modified = new fs.Stats().mtime.getTime()
exports.default = sdk.Plugin.define({
  setup(ctx) {
    const [count] = solid.createSignal(1)
    ctx.add(sdk.Command, { id: "open", title: "Notes" + count(), run: () => effect })
    return () => ctx.add(sdk.Command, { id: "closed", title: "", run() {} })
  },
})
`

const refuse = (file: string) => Promise.reject(new Error(`no chunk ${file} in this test`))

describe('plugin bundles in the page', () => {
  test("declare their definition before they start, with the app's module instances and Node built-ins inert", async () => {
    const definition = await pluginDefinition(
      'acme',
      {code: bundle, chunks: [], file: 'plugin-experimental.cjs'},
      refuse,
    )
    const added: {readonly registry: Registry<Command>; readonly item: Command}[] = []

    expect(definition.id).toBe('acme')

    const entry = await definition.windowEntry?.()

    const ctx = {
      add: (registry: Registry<Command>, item: Command) => void added.push({registry, item}),
    }

    const cleanup = entry?.default(ctx as never)

    expect(added[0]?.registry).toBe(Command)
    expect(added[0]?.item).toMatchObject({id: 'open', title: 'Notes1'})
    expect(added[0]?.item.run()).toBe(Effect)
    expect(cleanup).toBeTypeOf('function')
  })

  test('fail only their own entry when they require a module the app does not share', async () => {
    const definition = await pluginDefinition(
      'acme',
      {
        code: 'require("left-pad"); exports.default = { setup() {} }',
        chunks: [],
        file: 'plugin-experimental.cjs',
      },
      refuse,
    )
    const subpath = await pluginDefinition(
      'acme',
      {code: 'require("effect/Schema"); exports.default = { setup() {} }', chunks: [], file: 'plugin-experimental.cjs'},
      refuse,
    )
    const early = await pluginDefinition(
      'acme',
      {
        code: 'exports.default = { setup() {} }',
        chunks: [{file: 'start-A.cjs', code: 'require("./plugin-experimental.cjs")'}],
        file: 'plugin-experimental.cjs',
      },
      refuse,
    )

    expect(definition.id).toBe('acme')
    await expect(definition.windowEntry?.()).rejects.toThrow('left-pad')
    await expect(subpath.windowEntry?.()).rejects.toThrow(
      "A plugin's ./plugin-experimental bundle requires a module the app does not share: effect/Schema",
    )
    await expect(early.windowEntry?.()).rejects.toThrow(
      "A plugin's ./plugin-experimental chunk start-A.cjs requires the entry plugin-experimental.cjs before it finished evaluating",
    )
  })
})
