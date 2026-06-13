import {z} from 'zod'
import {TestEventSchema} from '@devgent/protocol/test-types'

// The child↔manager NDJSON contract, in its own side-effect-free module. The manager imports
// the schema from HERE, never from child.ts: child.ts runs main() at top level (it is a spawned
// process entry), so importing it for a value would boot a second vitest in-process and recurse.

// Control messages the child sends alongside TestEvents. Zod-validated by the manager.
const ListFileSchema = z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})
export const ListMessageSchema = z.object({type: z.literal('list'), files: z.array(ListFileSchema)})
export const ErrorMessageSchema = z.object({type: z.literal('error'), reason: z.string()})

// A TestEvent or a list/error control message.
export const ChildMessageSchema = z.union([TestEventSchema, ListMessageSchema, ErrorMessageSchema])
export type ChildMessage = z.infer<typeof ChildMessageSchema>
