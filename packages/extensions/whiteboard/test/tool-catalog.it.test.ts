import {expect, test} from 'vitest'
import {z} from 'zod'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {testHost} from './canvas-it-helpers.js'

const Listed = z
  .object({
    tools: z.array(
      z.object({name: z.string(), summary: z.string(), category: z.string(), mutating: z.boolean()}).loose(),
    ),
  })
  .loose()

const Detail = z.object({name: z.string(), output: z.unknown(), errors: z.array(z.unknown())}).loose()

const DECLARED_MUTATING: Record<string, boolean> = {
  'canvas.read': false,
  'canvas.svg': true,
  'canvas.preview': false,
  'canvas.export': false,
  'canvas.draw': true,
  'canvas.diagram': true,
  'canvas.connect': true,
  'canvas.update': true,
  'canvas.delete': true,
  'canvas.clear': true,
  'canvas.commit': true,
  'canvas.discard': true,
  'comment.create': true,
  'comment.reply': true,
  'comment.read': false,
  'comment.list': false,
  'comment.resolve': true,
  'comment.delete': true,
  'comment.move': true,
  'pin.setState': true,
  'anchor.resolve': false,
  'element.reference': false,
}

test('the sandbox catalog carries all twenty-two whiteboard declarations with honest mutating flags', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const listed = Listed.parse(await api.runTypescript("return await external_catalog({search: 'whiteboard'})"))
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]))
    for (const [name, mutating] of Object.entries(DECLARED_MUTATING)) {
      const entry = byName.get(name)
      expect(entry, name).toBeDefined()
      expect(entry?.mutating, name).toBe(mutating)
      expect(entry?.category, name).toBe('whiteboard')
      expect(entry?.summary, name).not.toBe('')
    }
    expect(listed.tools.filter((tool) => tool.name in DECLARED_MUTATING)).toHaveLength(22)
  } finally {
    await api.dispose()
  }
})

test('a whiteboard declaration exposes its output schema and declared errors through the catalog', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const detail = Detail.parse(await api.runTypescript("return await external_catalog({name: 'canvas.svg'})"))
    expect(JSON.stringify(detail.output)).toContain('pending')
    expect(JSON.stringify(detail.errors)).toContain('INVALID_SVG')
  } finally {
    await api.dispose()
  }
})
