import {z} from 'zod'

export const EditorOpenSchema = z.object({file: z.string().min(1), line: z.number().optional()})
export type EditorOpen = z.infer<typeof EditorOpenSchema>
