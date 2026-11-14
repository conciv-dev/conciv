import type {z} from 'zod'
import type {ToolBuilder} from '@conciv/extension'
import {defineTool} from '@conciv/extension/tool'
import {DESIGN_ERRORS} from './errors.js'

export function designTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  name: string
  summary: string
  running: string
  done: string
  input: z.ZodObject<Shape>
  output: Out
  keywords: readonly string[]
  catalog?: boolean
  positional?: string
}): DesignToolDef<Shape, Out> {
  return defineTool({
    name: spec.name,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: DESIGN_ERRORS,
    meta: {
      summary: spec.summary,
      category: DESIGN_EXTENSION_NAME,
      icon: 'read',
      label: {running: spec.running, done: spec.done},
      mutating: false,
      capture: 'none',
      keywords: spec.keywords,
      ...(spec.catalog === undefined ? {} : {catalog: spec.catalog}),
      ...(spec.positional === undefined ? {} : {positional: spec.positional}),
    },
  })
}

type DesignToolDef<Shape extends z.ZodRawShape, Out extends z.ZodType> = ToolBuilder<
  string,
  z.ZodObject<Shape>,
  Out,
  typeof DESIGN_ERRORS,
  undefined,
  unknown
>

const DESIGN_EXTENSION_NAME = 'design'
