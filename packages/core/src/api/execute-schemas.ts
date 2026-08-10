import {z} from 'zod'

export const EXECUTE_TOOL_NAME = 'execute_typescript'

export const ExecuteInputSchema = z.object({
  typescriptCode: z
    .string()
    .describe(
      'TypeScript to run in the sandbox. Call capabilities as async sandbox functions, discover them with `await external_catalog({})`, and return a value to pass results back.',
    ),
})

export const ExecuteErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  line: z.number().optional(),
})

export const ExecuteResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: ExecuteErrorSchema.optional(),
})

export type ExecuteResult = z.infer<typeof ExecuteResultSchema>
export type ExecuteError = z.infer<typeof ExecuteErrorSchema>
