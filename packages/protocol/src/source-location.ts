import {z} from 'zod'

export const RawFrameSchema = z.object({
  fileName: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  fn: z.string().optional(),
})
export type RawFrame = z.infer<typeof RawFrameSchema>
export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})
export type SourceLoc = z.infer<typeof SourceLocSchema>
