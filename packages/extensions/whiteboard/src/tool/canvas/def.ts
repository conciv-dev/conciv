import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

const skeleton = z
  .object({
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .loose()

const PendingOutput = z.object({pending: z.string()})

const RenderedImagePart = z.object({type: z.literal('image')}).loose()

const RenderedTextPart = z.object({type: z.literal('text'), content: z.string()}).loose()

const RenderedImage = z.array(z.union([RenderedImagePart, RenderedTextPart]))

export const canvasReadDef = toolDefinition({
  name: 'canvas.read',
  description:
    'List canvas elements. scope "live" (default) reads the published canvas; scope "draft" reads the hidden work-in-progress draft.',
  inputSchema: z.object({scope: z.enum(['live', 'draft']).default('live')}),
  outputSchema: z.object({elements: z.array(z.unknown()), scope: z.enum(['live', 'draft'])}),
  meta: {
    summary: 'list the elements on the published canvas or the hidden draft',
    category: 'whiteboard',
    mutating: false,
    keywords: ['canvas', 'elements', 'read'],
    hint: 'pass scope "draft" to inspect the work-in-progress draft',
  },
  promptSnippet:
    'Use canvas.read to see what is already drawn before adding more; pass scope "draft" to inspect the draft.',
})

export const canvasSvgDef = toolDefinition({
  name: 'canvas.svg',
  description:
    'Draw by writing SVG markup (paths, shapes, text, fills). Converted in the browser into editable Excalidraw elements. Drawings land in the hidden draft; commit publishes them.',
  inputSchema: z.object({
    svg: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    roughness: z.number().min(0).max(2).default(1),
  }),
  outputSchema: PendingOutput,
  errors: {INVALID_SVG: {message: 'the svg markup was rejected'}},
  meta: {
    summary: 'draw svg markup into the hidden draft',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'draw', 'svg'],
    hint: 'iterate with canvas.preview, then publish with canvas.commit',
  },
  streamTitle: 'Drawing on the canvas',
  promptSnippet:
    'Use canvas.svg for anything organic or illustrated: write SVG paths with layered fills, then iterate with canvas.preview before canvas.commit.',
})

export const canvasDrawDef = toolDefinition({
  name: 'canvas.draw',
  description:
    'Add Excalidraw element skeletons (rectangle, ellipse, diamond, text, arrow, line) to the hidden draft; commit publishes them.',
  inputSchema: z.object({elements: z.array(skeleton)}),
  outputSchema: PendingOutput,
  meta: {
    summary: 'add element skeletons to the hidden draft',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'draw', 'shapes'],
  },
  streamTitle: 'Drawing on the canvas',
  promptSnippet: 'Use canvas.draw to sketch shapes and text for the user; pass an array of element skeletons.',
})

export const canvasDiagramDef = toolDefinition({
  name: 'canvas.diagram',
  description: 'Render a Mermaid diagram (flowchart, sequence, class, ...) into the hidden draft; commit publishes it.',
  inputSchema: z.object({mermaid: z.string()}),
  outputSchema: PendingOutput,
  errors: {DIAGRAM_TOO_LARGE: {message: 'the diagram exceeds the edge limit'}},
  meta: {
    summary: 'render a mermaid diagram into the hidden draft',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'diagram', 'mermaid'],
  },
  streamTitle: 'Drawing a diagram',
  promptSnippet: 'Use canvas.diagram with Mermaid source to render a structured diagram on the canvas.',
})

export const canvasConnectDef = toolDefinition({
  name: 'canvas.connect',
  description: 'Draw a binding arrow from one element to another by elementId.',
  inputSchema: z.object({fromId: z.string(), toId: z.string()}),
  outputSchema: PendingOutput,
  meta: {
    summary: 'draw a binding arrow between two elements',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'arrow', 'connect'],
  },
  promptSnippet: 'Use canvas.connect to link two existing elements with an arrow.',
})

export const canvasUpdateDef = toolDefinition({
  name: 'canvas.update',
  description: 'Patch fields of an existing canvas element by elementId.',
  inputSchema: z.object({elementId: z.string(), patch: z.record(z.string(), z.unknown())}),
  outputSchema: z.object({updated: z.boolean()}),
  meta: {
    summary: 'patch fields of an existing canvas element',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'update', 'patch'],
    hint: 'answers updated false when the elementId matches nothing',
  },
  promptSnippet: 'Use canvas.update to change an element you previously drew.',
})

export const canvasDeleteDef = toolDefinition({
  name: 'canvas.delete',
  description: 'Remove an element from the canvas by elementId.',
  inputSchema: z.object({elementId: z.string()}),
  outputSchema: z.object({deleted: z.string()}),
  approval: 'ask',
  meta: {
    summary: 'remove one element from the canvas',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'delete', 'element'],
    hint: 'destructive; the user is asked to confirm',
  },
  promptSnippet: 'Use canvas.delete to remove an element. Destructive; the user is asked to confirm.',
})

export const canvasClearDef = toolDefinition({
  name: 'canvas.clear',
  description: 'Remove every element from the canvas.',
  inputSchema: z.object({}),
  outputSchema: z.object({cleared: z.number()}),
  approval: 'ask',
  meta: {
    summary: 'wipe every element off the canvas',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'clear', 'wipe'],
    hint: 'destructive; the user is asked to confirm',
  },
  promptSnippet: 'Use canvas.clear to wipe the canvas. Destructive; the user is asked to confirm.',
})

export const canvasExportDef = toolDefinition({
  name: 'canvas.export',
  description:
    'Export the canvas: json returns elements; png returns a real Excalidraw rendering (requires an open canvas tab).',
  inputSchema: z.object({
    format: z.enum(['json', 'png']).default('json'),
    scope: z.enum(['live', 'draft', 'both']).default('live'),
  }),
  outputSchema: z.union([
    RenderedImage,
    z.object({error: z.string(), reason: z.string(), scope: z.string()}),
    z.object({elements: z.array(z.unknown())}),
  ]),
  errors: {EXPORT_TIMEOUT: {message: 'no canvas tab replied to the export request in time'}},
  meta: {
    summary: 'export the canvas as json elements or a rendered png',
    category: 'whiteboard',
    mutating: false,
    keywords: ['canvas', 'export', 'png'],
    hint: 'png needs an open canvas tab; canvas.preview works without one',
  },
  promptSnippet: 'Use canvas.export with format png and scope draft for a ground-truth render before canvas.commit.',
})

export const canvasCommitDef = toolDefinition({
  name: 'canvas.commit',
  description: 'Publish the hidden draft to the shared canvas. The agent cursor performs the drawing for the user.',
  inputSchema: z.object({}),
  outputSchema: z.union([
    z.object({committed: z.literal(true), elements: z.number()}),
    z.object({committed: z.literal(false), reason: z.string()}),
  ]),
  errors: {COMMIT_TIMEOUT: {message: 'no canvas tab performed the commit in time'}},
  meta: {
    summary: 'publish the hidden draft to the shared canvas',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'commit', 'publish'],
    hint: 'until commit the user sees nothing of the draft',
  },
  streamTitle: 'Publishing the drawing',
  promptSnippet: 'Always finish a drawing with canvas.commit; until then the user sees nothing.',
})

export const canvasDiscardDef = toolDefinition({
  name: 'canvas.discard',
  description: 'Throw away the hidden draft without publishing anything.',
  inputSchema: z.object({}),
  outputSchema: z.object({discarded: z.number(), error: z.string().optional(), reason: z.string().optional()}),
  meta: {
    summary: 'throw away the hidden draft',
    category: 'whiteboard',
    mutating: true,
    keywords: ['canvas', 'discard', 'draft'],
  },
  promptSnippet: 'Use canvas.discard to abandon a draft and start over.',
})

export const canvasPreviewDef = toolDefinition({
  name: 'canvas.preview',
  description:
    'Fast server-side PNG of the current hidden draft (approximate: plain shapes, no hand-drawn strokes). Use between refinements; canvas.export png is the ground truth.',
  inputSchema: z.object({}),
  outputSchema: z.union([
    RenderedImage,
    z.object({empty: z.literal(true), reason: z.string()}),
    z.object({error: z.string(), reason: z.string(), elements: z.number()}),
  ]),
  meta: {
    summary: 'render a fast approximate png of the hidden draft',
    category: 'whiteboard',
    mutating: false,
    keywords: ['canvas', 'preview', 'draft'],
    hint: 'approximate render; canvas.export png is the ground truth',
  },
  streamTitle: 'Checking the draft',
  promptSnippet: 'After drawing into the draft, call canvas.preview, critique the image, refine, repeat.',
})
