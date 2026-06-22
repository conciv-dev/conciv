import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'
import {canvasEffect} from './canvas/canvas-effect.js'
import {createCanvasTools} from './tools/canvas.js'

const ping = defineTool({
  name: 'whiteboard.ping',
  label: 'Whiteboard ping',
  description: 'Health check for the whiteboard extension.',
  parameters: z.object({}),
  execute: async () => 'pong',
})

export default defineExtension({id: 'whiteboard', tools: [ping], effects: [canvasEffect]})
  .server((mx) => {
    createCanvasTools(mx.sync).forEach((tool) => mx.registerTool(tool))
    mx.approval('canvas.delete', 'ask')
    mx.approval('canvas.clear', 'ask')
  })
  .client(() => {})
