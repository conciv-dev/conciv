import {z} from 'zod'
import {TestEventSchema} from '@aidx/protocol/test-types'

// The child↔driver NDJSON contract, in its own side-effect-free module shared by every
// adapter child + the driver. A child imports the `ChildMessage` TYPE to shape its send();
// the driver imports `ChildMessageSchema` to VALIDATE each line. The schema must NOT live in
// a child.ts: children run main() at top level (they are spawned process entries), so importing
// one for a value would boot a runner in-process — see the warning in vitest/child.ts.

const ListFileSchema = z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})
export const ListMessageSchema = z.object({type: z.literal('list'), files: z.array(ListFileSchema)})
export const ErrorMessageSchema = z.object({type: z.literal('error'), reason: z.string()})

// A TestEvent or a list/error control message.
export const ChildMessageSchema = z.union([TestEventSchema, ListMessageSchema, ErrorMessageSchema])
export type ChildMessage = z.infer<typeof ChildMessageSchema>
