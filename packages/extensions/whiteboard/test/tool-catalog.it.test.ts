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

const Detail = z
  .object({name: z.string(), output: z.unknown(), errors: z.array(z.object({code: z.string()}).loose())})
  .loose()

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

const DECLARED_ERRORS: Record<string, string[]> = {
  'canvas.svg': ['INVALID_SVG'],
  'canvas.diagram': ['DIAGRAM_TOO_LARGE'],
  'canvas.export': ['EXPORT_TIMEOUT'],
  'canvas.commit': ['COMMIT_TIMEOUT'],
  'comment.reply': ['COMMENT_NOT_FOUND'],
  'comment.read': ['COMMENT_NOT_FOUND'],
  'comment.resolve': ['COMMENT_NOT_FOUND'],
  'comment.delete': ['COMMENT_NOT_FOUND'],
  'comment.move': ['PIN_NOT_FOUND'],
  'pin.setState': ['PIN_NOT_FOUND'],
  'anchor.resolve': ['COMMENT_NOT_FOUND'],
}

test('every whiteboard declaration exposes its output schema and declared errors through the catalog', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const svg = Detail.parse(await api.runTypescript("return await external_catalog({name: 'canvas.svg'})"))
    expect(JSON.stringify(svg.output)).toContain('pending')
    for (const [name, codes] of Object.entries(DECLARED_ERRORS)) {
      const detail = Detail.parse(await api.runTypescript(`return await external_catalog({name: '${name}'})`))
      const declared = detail.errors.map((error) => error.code)
      for (const code of codes) expect(declared, name).toContain(code)
    }
  } finally {
    await api.dispose()
  }
})
