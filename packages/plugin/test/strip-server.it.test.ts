import {describe, it, expect} from 'vitest'
import {stripServerHalf} from '../src/core/strip-server.js'

const FILENAME = '/proj/mandarax/extensions/canvas.tsx'

describe('stripServerHalf', () => {
  it('replaces a defineExtension .server() argument with undefined', async () => {
    const {code} = await stripServerHalf(
      `import {defineExtension} from '@mandarax/extension'
export const canvas = defineExtension({name: 'canvas'}).server(() => ({systemPrompt: 'hi'}))`,
      FILENAME,
    )
    expect(code).toContain('.server(undefined)')
    expect(code).not.toContain('systemPrompt')
  })

  it('replaces a defineTool .server() execute argument too', async () => {
    const {code} = await stripServerHalf(
      `import {defineTool} from '@mandarax/extension'
export const draw = defineTool({name: 'draw'}).server((input) => run(input)).render(Card)`,
      FILENAME,
    )
    expect(code).toContain('.server(undefined)')
    expect(code).toContain('.render(Card)')
    expect(code).not.toContain('run(input)')
  })

  it('removes a node import referenced only inside .server()', async () => {
    const {code} = await stripServerHalf(
      `import {readFileSync} from 'node:fs'
import {defineExtension} from '@mandarax/extension'
export const canvas = defineExtension({name: 'canvas'}).server(() => readFileSync('x'))`,
      FILENAME,
    )
    expect(code).not.toContain('node:fs')
    expect(code).not.toContain('readFileSync')
  })

  it('keeps a shared binding referenced by both halves', async () => {
    const {code} = await stripServerHalf(
      `import {schema} from './schema.js'
import {defineExtension} from '@mandarax/extension'
function Surface() { return schema.label }
export const canvas = defineExtension({name: 'canvas', Component: Surface}).server(() => schema.parse({}))`,
      FILENAME,
    )
    expect(code).toContain('./schema.js')
    expect(code).toContain('schema.label')
  })

  it('leaves the Component and .client() half untouched', async () => {
    const {code} = await stripServerHalf(
      `import {defineExtension} from '@mandarax/extension'
function Surface() { const slot = canvas.useSlot(); return slot() }
export const canvas = defineExtension({name: 'canvas', Component: Surface})
  .client(() => ({value: {ready: true}}))
  .server(() => ({tools: []}))`,
      FILENAME,
    )
    expect(code).toContain('useSlot()')
    expect(code).toContain('ready: true')
    expect(code).toContain('.server(undefined)')
  })

  it('throws when a node-builtin import survives in client code', async () => {
    await expect(
      stripServerHalf(
        `import {readFileSync} from 'node:fs'
import {defineExtension} from '@mandarax/extension'
function Surface() { return readFileSync('client-leak') }
export const canvas = defineExtension({name: 'canvas', Component: Surface}).server(() => ({}))`,
        FILENAME,
      ),
    ).rejects.toThrow(/node-only import "node:fs" survives/)
  })

  it('throws on a surviving side-effect node import', async () => {
    await expect(
      stripServerHalf(
        `import 'node:crypto'
import {defineExtension} from '@mandarax/extension'
export const canvas = defineExtension({name: 'canvas'}).server(() => ({}))`,
        FILENAME,
      ),
    ).rejects.toThrow(/node-only import "node:crypto" survives/)
  })
})
