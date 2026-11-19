import {z} from 'zod'
import {TestEventSchema} from './events.js'

const ListFileSchema = z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})
const ListMessageSchema = z.object({type: z.literal('list'), files: z.array(ListFileSchema)})
const ErrorMessageSchema = z.object({type: z.literal('error'), reason: z.string()})

export const ChildMessageSchema = z.union([TestEventSchema, ListMessageSchema, ErrorMessageSchema])
export type ChildMessage = z.infer<typeof ChildMessageSchema>
