import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type * as Y from 'yjs'
import {defineTool, type ToolDefinition, type ToolExecuteCtx} from '@mandarax/extensions'
import type {SyncEngine} from '@mandarax/protocol/sync-types'
import {ELEMENTS_KEY, ORIGIN, PENDING_KEY, roomId} from '../room.js'
import type {SceneElement} from '../canvas/glue.js'

const skeleton = z
  .object({type: z.string(), x: z.number(), y: z.number(), width: z.number().optional(), height: z.number().optional()})
  .passthrough()

type Skeleton = z.infer<typeof skeleton>

const roomOf = (sync: SyncEngine, ctx: ToolExecuteCtx | undefined) =>
  sync.room(roomId(ctx?.previewId ?? '', ctx?.sessionId ?? ''))

const elementsOf = (sync: SyncEngine, ctx: ToolExecuteCtx | undefined): SceneElement[] => [
  ...roomOf(sync, ctx).doc.getMap<SceneElement>(ELEMENTS_KEY).values(),
]

function transact(sync: SyncEngine, ctx: ToolExecuteCtx | undefined, mutate: (doc: Y.Doc) => void): void {
  const room = roomOf(sync, ctx)
  room.doc.transact(() => mutate(room.doc), ORIGIN.AI)
}

function enqueue(sync: SyncEngine, ctx: ToolExecuteCtx | undefined, skeletons: Skeleton[]): string {
  const id = randomUUID()
  const room = roomOf(sync, ctx)
  room.awareness.setLocalStateField('user', {id: 'ai', name: 'AI', color: {background: '#d0bfff', stroke: '#7048e8'}})
  room.doc.transact(() => room.doc.getMap(PENDING_KEY).set(id, {elements: skeletons}), ORIGIN.AI)
  return id
}

export function createCanvasTools(sync: SyncEngine): ToolDefinition[] {
  const read = defineTool({
    name: 'canvas.read',
    label: 'Read canvas',
    description: 'List the current elements on the shared whiteboard canvas.',
    parameters: z.object({}),
    promptSnippet: 'Use canvas.read to see what is already drawn before adding more.',
    execute: async (_input, ctx) => ({elements: elementsOf(sync, ctx)}),
  })

  const draw = defineTool({
    name: 'canvas.draw',
    label: 'Draw on canvas',
    description: 'Add Excalidraw element skeletons (rectangle, ellipse, diamond, text, arrow, line) to the canvas.',
    parameters: z.object({elements: z.array(skeleton)}),
    promptSnippet: 'Use canvas.draw to sketch shapes and text for the user; pass an array of element skeletons.',
    execute: async (input, ctx) => ({pending: enqueue(sync, ctx, input.elements)}),
  })

  const connect = defineTool({
    name: 'canvas.connect',
    label: 'Connect elements',
    description: 'Draw a binding arrow from one element to another by id.',
    parameters: z.object({fromId: z.string(), toId: z.string()}),
    promptSnippet: 'Use canvas.connect to link two existing elements with an arrow.',
    execute: async (input, ctx) => ({
      pending: enqueue(sync, ctx, [{type: 'arrow', x: 0, y: 0, start: {id: input.fromId}, end: {id: input.toId}}]),
    }),
  })

  const update = defineTool({
    name: 'canvas.update',
    label: 'Update element',
    description: 'Patch fields of an existing canvas element by id.',
    parameters: z.object({id: z.string(), patch: z.record(z.string(), z.unknown())}),
    promptSnippet: 'Use canvas.update to change an element you previously drew.',
    execute: async (input, ctx) => {
      const current = roomOf(sync, ctx).doc.getMap<SceneElement>(ELEMENTS_KEY).get(input.id)
      if (!current) return {updated: false}
      transact(sync, ctx, (doc) =>
        doc
          .getMap<SceneElement>(ELEMENTS_KEY)
          .set(input.id, {...current, ...input.patch, version: current.version + 1}),
      )
      return {updated: true}
    },
  })

  const remove = defineTool({
    name: 'canvas.delete',
    label: 'Delete element',
    description: 'Remove an element from the canvas by id.',
    parameters: z.object({id: z.string()}),
    promptSnippet: 'Use canvas.delete to remove an element. Destructive; the user is asked to confirm.',
    execute: async (input, ctx) => {
      transact(sync, ctx, (doc) => doc.getMap<SceneElement>(ELEMENTS_KEY).delete(input.id))
      return {deleted: input.id}
    },
  })

  const clear = defineTool({
    name: 'canvas.clear',
    label: 'Clear canvas',
    description: 'Remove every element from the canvas.',
    parameters: z.object({}),
    promptSnippet: 'Use canvas.clear to wipe the canvas. Destructive; the user is asked to confirm.',
    execute: async (_input, ctx) => {
      transact(sync, ctx, (doc) => {
        doc.getMap<SceneElement>(ELEMENTS_KEY).clear()
        doc.getMap(PENDING_KEY).clear()
      })
      return {cleared: true}
    },
  })

  const exportScene = defineTool({
    name: 'canvas.export',
    label: 'Export canvas',
    description: 'Return the canvas scene as JSON (no image export in v1).',
    parameters: z.object({}),
    promptSnippet: 'Use canvas.export to capture the scene elements as JSON.',
    execute: async (_input, ctx) => ({elements: elementsOf(sync, ctx)}),
  })

  return [read, draw, connect, update, remove, clear, exportScene]
}
