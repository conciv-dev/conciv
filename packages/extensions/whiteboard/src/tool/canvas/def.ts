import {z} from 'zod'

const skeleton = z
  .object({
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough()

export const CanvasReadInput = z.object({})
export const CanvasDrawInput = z.object({elements: z.array(skeleton)})
export const CanvasDiagramInput = z.object({mermaid: z.string()})
export const CanvasConnectInput = z.object({fromId: z.string(), toId: z.string()})
export const CanvasUpdateInput = z.object({elementId: z.string(), patch: z.record(z.string(), z.unknown())})
export const CanvasDeleteInput = z.object({elementId: z.string()})
export const CanvasClearInput = z.object({})
export const CanvasExportInput = z.object({})

export const canvasReadDef = {
  name: 'canvas.read',
  description: 'List the current elements on the shared whiteboard canvas.',
  inputSchema: CanvasReadInput,
  promptSnippet: 'Use canvas.read to see what is already drawn before adding more.',
}

export const canvasDrawDef = {
  name: 'canvas.draw',
  description: 'Add Excalidraw element skeletons (rectangle, ellipse, diamond, text, arrow, line) to the canvas.',
  inputSchema: CanvasDrawInput,
  streamTitle: 'Drawing on the canvas',
  promptSnippet: 'Use canvas.draw to sketch shapes and text for the user; pass an array of element skeletons.',
}

export const canvasDiagramDef = {
  name: 'canvas.diagram',
  description: 'Render a Mermaid diagram (flowchart, sequence, class, ...) onto the canvas.',
  inputSchema: CanvasDiagramInput,
  streamTitle: 'Drawing a diagram',
  promptSnippet: 'Use canvas.diagram with Mermaid source to render a structured diagram on the canvas.',
}

export const canvasConnectDef = {
  name: 'canvas.connect',
  description: 'Draw a binding arrow from one element to another by elementId.',
  inputSchema: CanvasConnectInput,
  promptSnippet: 'Use canvas.connect to link two existing elements with an arrow.',
}

export const canvasUpdateDef = {
  name: 'canvas.update',
  description: 'Patch fields of an existing canvas element by elementId.',
  inputSchema: CanvasUpdateInput,
  promptSnippet: 'Use canvas.update to change an element you previously drew.',
}

export const canvasDeleteDef = {
  name: 'canvas.delete',
  description: 'Remove an element from the canvas by elementId.',
  inputSchema: CanvasDeleteInput,
  approval: 'ask',
  promptSnippet: 'Use canvas.delete to remove an element. Destructive; the user is asked to confirm.',
} as const

export const canvasClearDef = {
  name: 'canvas.clear',
  description: 'Remove every element from the canvas.',
  inputSchema: CanvasClearInput,
  approval: 'ask',
  promptSnippet: 'Use canvas.clear to wipe the canvas. Destructive; the user is asked to confirm.',
} as const

export const canvasExportDef = {
  name: 'canvas.export',
  description: 'Return the canvas scene as JSON (no image export in v1).',
  inputSchema: CanvasExportInput,
  promptSnippet: 'Use canvas.export to capture the scene elements as JSON.',
}
