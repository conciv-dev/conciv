import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'
import type {CanvasRelay, CanvasElement} from '../../canvas/relay.js'

// The canvas-comments built-in, authored against the real extension contract (dogfooding it) but
// registered at engine boot rather than file-discovered. Phase 3 ships the first canvas capabilities;
// comment tools land in phase 4+. Tools close over the canvas context (relay + active session).
export type CanvasContext = {relay: CanvasRelay; sessionId: () => string}

const ElementSchema = z.object({id: z.string(), version: z.number()}).passthrough()

export function createCanvasCommentsExtension(ctx: CanvasContext) {
  const canvasRead = defineTool({
    name: 'canvas.read',
    description: 'Read every element currently on the canvas (id-keyed).',
    inputSchema: z.object({}),
    promptSnippet: 'Use canvas.read to see what is drawn before adding to it.',
  }).server(async () => ({elements: await ctx.relay.read(ctx.sessionId())}))

  const canvasDraw = defineTool({
    name: 'canvas.draw',
    description: 'Add or update elements on the canvas by id (granular, never a full-scene overwrite).',
    inputSchema: z.object({elements: z.array(ElementSchema)}),
    promptSnippet: 'Use canvas.draw with explicit element ids; re-drawing an id updates it in place.',
  }).server(async (input) => {
    await ctx.relay.draw(ctx.sessionId(), input.elements as CanvasElement[])
    return {ok: true, count: input.elements.length}
  })

  return defineExtension({id: 'canvas-comments', tools: [canvasRead, canvasDraw]})
}
