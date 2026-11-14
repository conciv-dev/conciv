import {z} from 'zod'
import {TestEventSchema} from '../shared/events.js'

const ListFileSchema = z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})
export const ListMessageSchema = z.object({type: z.literal('list'), files: z.array(ListFileSchema)})
export const ErrorMessageSchema = z.object({type: z.literal('error'), reason: z.string()})

export const ChildMessageSchema = z.union([TestEventSchema, ListMessageSchema, ErrorMessageSchema])
export type ChildMessage = z.infer<typeof ChildMessageSchema>
