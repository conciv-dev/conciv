import {z} from 'zod'

export const OpenInput = z.object({
  file: z.string().min(1).describe('the file to open'),
  line: z.coerce.number().int().min(1).optional().describe('line number to jump to'),
  column: z.coerce.number().int().min(1).optional().describe('column to jump to, used only with a line'),
})
