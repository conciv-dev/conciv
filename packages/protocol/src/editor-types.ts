import {z} from 'zod'

// POST /api/editor/open body — "open this file at this line". Shared by core (validation) and the
// widget transport (typing).
export const EditorOpenSchema = z.object({file: z.string().min(1), line: z.number().optional()})
export type EditorOpen = z.infer<typeof EditorOpenSchema>
