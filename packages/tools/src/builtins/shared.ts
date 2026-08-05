import {z} from 'zod'

export const AnyRecord = z.record(z.string(), z.unknown())

export const OkResult = z.object({ok: z.literal(true)})

export const ElementTarget = {
  selector: z.string().optional().describe('CSS selector for the target element'),
  ref: z.string().optional().describe('element ref from the latest snapshot'),
  name: z.string().optional().describe('React component name (targets the first match)'),
}

export type BuiltinCategory = 'read' | 'act' | 'edit-live' | 'react' | 'server'
