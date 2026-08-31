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
  canvas_read: false,
  canvas_svg: true,
  canvas_preview: false,
  canvas_export: false,
  canvas_draw: true,
  canvas_diagram: true,
  canvas_connect: true,
  canvas_update: true,
  canvas_delete: true,
  canvas_clear: true,
  canvas_commit: true,
  canvas_discard: true,
  comment_create: true,
  comment_reply: true,
  comment_read: false,
  comment_list: false,
  comment_resolve: true,
  comment_delete: true,
  comment_move: true,
  pin_set_state: true,
  anchor_resolve: false,
  element_reference: false,
}

const EXPECTED_NAMES = new Set(Object.keys(DECLARED_MUTATING))

test('the sandbox catalog carries exactly the twenty-two whiteboard declarations with honest mutating flags', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const listed = Listed.parse(await api.runTypescript("return await external_catalog({search: 'whiteboard'})"))
    const whiteboardTools = listed.tools.filter((tool) => tool.category === 'whiteboard')
    const actualNames = new Set(whiteboardTools.map((tool) => tool.name))
    expect(actualNames).toEqual(EXPECTED_NAMES)
    const byName = new Map(whiteboardTools.map((tool) => [tool.name, tool]))
    for (const [name, mutating] of Object.entries(DECLARED_MUTATING)) {
      const entry = byName.get(name)
      expect(entry, name).toBeDefined()
      expect(entry?.mutating, name).toBe(mutating)
      expect(entry?.summary, name).not.toBe('')
    }
  } finally {
    await api.dispose()
  }
})

const DECLARED_ERRORS: Record<string, string[]> = {
  canvas_svg: ['INVALID_SVG'],
  canvas_diagram: ['DIAGRAM_TOO_LARGE'],
  canvas_export: ['EXPORT_TIMEOUT'],
  canvas_commit: ['COMMIT_TIMEOUT'],
  comment_reply: ['COMMENT_NOT_FOUND'],
  comment_read: ['COMMENT_NOT_FOUND'],
  comment_resolve: ['COMMENT_NOT_FOUND'],
  comment_delete: ['COMMENT_NOT_FOUND'],
  comment_move: ['PIN_NOT_FOUND'],
  pin_set_state: ['PIN_NOT_FOUND'],
  anchor_resolve: ['COMMENT_NOT_FOUND'],
}

type OutputShape =
  | {kind: 'object'; properties: string[]; required: string[]}
  | {kind: 'union'; members: OutputShape[]}
  | {kind: 'array'}

type JsonSchemaNode = {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  anyOf?: JsonSchemaNode[]
}

const JsonSchemaNode: z.ZodType<JsonSchemaNode> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      required: z.array(z.string()).optional(),
      anyOf: z.array(JsonSchemaNode).optional(),
    })
    .loose(),
)

function shapeOf(node: JsonSchemaNode): OutputShape {
  if (node.anyOf !== undefined) return {kind: 'union', members: node.anyOf.map(shapeOf)}
  if (node.type === 'array') return {kind: 'array'}
  return {
    kind: 'object',
    properties: Object.keys(node.properties ?? {}).toSorted(),
    required: (node.required ?? []).toSorted(),
  }
}

const EXPECTED_OUTPUT_SHAPES: Record<string, OutputShape> = {
  canvas_read: {kind: 'object', properties: ['elements', 'scope'], required: ['elements', 'scope']},
  canvas_svg: {kind: 'object', properties: ['pending'], required: ['pending']},
  canvas_draw: {kind: 'object', properties: ['pending'], required: ['pending']},
  canvas_diagram: {kind: 'object', properties: ['pending'], required: ['pending']},
  canvas_connect: {kind: 'object', properties: ['pending'], required: ['pending']},
  canvas_update: {kind: 'object', properties: ['updated'], required: ['updated']},
  canvas_delete: {kind: 'object', properties: ['deleted'], required: ['deleted']},
  canvas_clear: {kind: 'object', properties: ['cleared'], required: ['cleared']},
  canvas_export: {
    kind: 'union',
    members: [
      {kind: 'array'},
      {kind: 'object', properties: ['error', 'reason', 'scope'], required: ['error', 'reason', 'scope']},
      {kind: 'object', properties: ['elements'], required: ['elements']},
    ],
  },
  canvas_commit: {
    kind: 'union',
    members: [
      {kind: 'object', properties: ['committed', 'elements'], required: ['committed', 'elements']},
      {kind: 'object', properties: ['committed', 'reason'], required: ['committed', 'reason']},
    ],
  },
  canvas_discard: {
    kind: 'object',
    properties: ['discarded', 'error', 'reason'],
    required: ['discarded'],
  },
  canvas_preview: {
    kind: 'union',
    members: [
      {kind: 'array'},
      {kind: 'object', properties: ['empty', 'reason'], required: ['empty', 'reason']},
      {kind: 'object', properties: ['elements', 'error', 'reason'], required: ['elements', 'error', 'reason']},
    ],
  },
  comment_create: {kind: 'object', properties: ['cid'], required: ['cid']},
  comment_reply: {kind: 'object', properties: ['cid'], required: ['cid']},
  comment_read: {kind: 'object', properties: ['comment', 'replies'], required: ['comment', 'replies']},
  comment_list: {kind: 'object', properties: ['comments'], required: ['comments']},
  comment_resolve: {kind: 'object', properties: ['cid', 'status'], required: ['cid', 'status']},
  comment_delete: {kind: 'object', properties: ['cid', 'deleted'], required: ['cid', 'deleted']},
  comment_move: {kind: 'object', properties: ['cid', 'x', 'y'], required: ['cid', 'x', 'y']},
  pin_set_state: {kind: 'object', properties: ['cid', 'pinState'], required: ['cid', 'pinState']},
  anchor_resolve: {
    kind: 'object',
    properties: ['anchor', 'candidates', 'diff', 'status'],
    required: ['status'],
  },
  element_reference: {
    kind: 'object',
    properties: ['column', 'file', 'found', 'line'],
    required: ['found'],
  },
}

test('every whiteboard declaration exposes the exact declared errors and output schema through the catalog', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    for (const name of Object.keys(DECLARED_MUTATING)) {
      const detail = Detail.parse(await api.runTypescript(`return await external_catalog({name: '${name}'})`))
      const expectedCodes = DECLARED_ERRORS[name] ?? []
      const declaredCodes = detail.errors.map((error) => error.code).toSorted()
      expect(declaredCodes, name).toEqual(expectedCodes.toSorted())
      const expectedShape = EXPECTED_OUTPUT_SHAPES[name]
      if (expectedShape === undefined) throw new Error(`no expected output shape recorded for "${name}"`)
      expect(shapeOf(JsonSchemaNode.parse(detail.output)), name).toEqual(expectedShape)
    }
  } finally {
    await api.dispose()
  }
})

test('a thrown COMMENT_NOT_FOUND surfaces its declared code through the real call path', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await expect(api.callTool('comment_read', {cid: 'nonexistent-cid'})).rejects.toThrow(/COMMENT_NOT_FOUND/)
  } finally {
    await api.dispose()
  }
})
