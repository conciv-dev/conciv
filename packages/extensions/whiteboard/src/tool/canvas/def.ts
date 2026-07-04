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

export const CanvasReadInput = z.object({scope: z.enum(['live', 'draft']).default('live')})
export const CanvasSvgInput = z.object({
  svg: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  roughness: z.number().min(0).max(2).default(1),
})
export const CanvasDrawInput = z.object({elements: z.array(skeleton)})
export const CanvasDiagramInput = z.object({mermaid: z.string()})
export const CanvasConnectInput = z.object({fromId: z.string(), toId: z.string()})
export const CanvasUpdateInput = z.object({elementId: z.string(), patch: z.record(z.string(), z.unknown())})
export const CanvasDeleteInput = z.object({elementId: z.string()})
export const CanvasClearInput = z.object({})
export const CanvasExportInput = z.object({})
export const CanvasCommitInput = z.object({})
export const CanvasDiscardInput = z.object({})
export const CanvasPreviewInput = z.object({})

export const canvasReadDef = {
  name: 'canvas.read',
  description:
    'List canvas elements. scope "live" (default) reads the published canvas; scope "draft" reads the hidden work-in-progress draft.',
  inputSchema: CanvasReadInput,
  promptSnippet: 'Use canvas.read to see what is already drawn before adding more; pass scope "draft" to inspect the draft.',
}

export const canvasSvgDef = {
  name: 'canvas.svg',
  description:
    'Draw by writing SVG markup (paths, shapes, text, fills). Converted in the browser into editable Excalidraw elements. Drawings land in the hidden draft; commit publishes them.',
  inputSchema: CanvasSvgInput,
  streamTitle: 'Drawing on the canvas',
  promptSnippet:
    'Use canvas.svg for anything organic or illustrated: write SVG paths with layered fills, then iterate with canvas.preview before canvas.commit.',
}

export const canvasDrawDef = {
  name: 'canvas.draw',
  description:
    'Add Excalidraw element skeletons (rectangle, ellipse, diamond, text, arrow, line) to the hidden draft; commit publishes them.',
  inputSchema: CanvasDrawInput,
  streamTitle: 'Drawing on the canvas',
  promptSnippet: 'Use canvas.draw to sketch shapes and text for the user; pass an array of element skeletons.',
}

export const canvasDiagramDef = {
  name: 'canvas.diagram',
  description: 'Render a Mermaid diagram (flowchart, sequence, class, ...) into the hidden draft; commit publishes it.',
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

export const canvasCommitDef = {
  name: 'canvas.commit',
  description: 'Publish the hidden draft to the shared canvas. The agent cursor performs the drawing for the user.',
  inputSchema: CanvasCommitInput,
  streamTitle: 'Publishing the drawing',
  promptSnippet: 'Always finish a drawing with canvas.commit; until then the user sees nothing.',
}

export const canvasDiscardDef = {
  name: 'canvas.discard',
  description: 'Throw away the hidden draft without publishing anything.',
  inputSchema: CanvasDiscardInput,
  promptSnippet: 'Use canvas.discard to abandon a draft and start over.',
}

export const canvasPreviewDef = {
  name: 'canvas.preview',
  description:
    'Fast server-side PNG of the current hidden draft (approximate: plain shapes, no hand-drawn strokes). Use between refinements; canvas.export png is the ground truth.',
  inputSchema: CanvasPreviewInput,
  streamTitle: 'Checking the draft',
  promptSnippet: 'After drawing into the draft, call canvas.preview, critique the image, refine, repeat.',
}
