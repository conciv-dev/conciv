import {z} from 'zod'

export const ELEMENT_CAPTURE_KINDS = ['before', 'after'] as const
export type ElementCaptureKind = (typeof ELEMENT_CAPTURE_KINDS)[number]

export const TOOL_CAPTURE_MODES = ['none', 'after', 'before-after'] as const
export type ToolCaptureMode = (typeof TOOL_CAPTURE_MODES)[number]

export const ElementRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type ElementRect = z.infer<typeof ElementRectSchema>

export const ElementDescriptorSchema = z.object({
  tagName: z.string(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  value: z.string().optional(),
  checked: z.boolean().optional(),
  rect: ElementRectSchema.optional(),
  selectorPath: z.string(),
  componentName: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().int().optional(),
})
export type ElementDescriptor = z.infer<typeof ElementDescriptorSchema>

export const ElementCaptureSchema = z.object({
  kind: z.enum(ELEMENT_CAPTURE_KINDS),
  ts: z.number(),
  descriptor: ElementDescriptorSchema,
  node: z.unknown().optional(),
  cssBundleId: z.string().optional(),
})
export type ElementCapture = z.infer<typeof ElementCaptureSchema>

export const CssBundleSchema = z.object({hash: z.string(), css: z.string()})
export type CssBundle = z.infer<typeof CssBundleSchema>

export const PageCaptureBundleSchema = z.object({
  before: ElementCaptureSchema.optional(),
  after: ElementCaptureSchema.optional(),
  cssBundles: z.array(CssBundleSchema).optional(),
})
export type PageCaptureBundle = z.infer<typeof PageCaptureBundleSchema>

export const ToolCaptureRowSchema = z.object({
  toolCallId: z.string(),
  kind: z.enum(ELEMENT_CAPTURE_KINDS),
  capture: ElementCaptureSchema,
})
export type ToolCaptureRow = z.infer<typeof ToolCaptureRowSchema>

export const SessionCapturesSchema = z.object({
  captures: z.array(ToolCaptureRowSchema),
  cssBundles: z.record(z.string(), z.string()),
})
export type SessionCaptures = z.infer<typeof SessionCapturesSchema>

export type ToolCaptureView = {before?: ElementCapture; after?: ElementCapture; css?: string}

export function toolCaptureViews(session: SessionCaptures): Record<string, ToolCaptureView> {
  const views: Record<string, ToolCaptureView> = {}
  for (const row of session.captures) {
    const existing = views[row.toolCallId] ?? {}
    const css = row.capture.cssBundleId === undefined ? undefined : session.cssBundles[row.capture.cssBundleId]
    views[row.toolCallId] = {...existing, [row.kind]: row.capture, ...(css === undefined ? {} : {css})}
  }
  return views
}
