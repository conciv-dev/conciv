import type {z} from 'zod'
import type {DESIGN_TOOLS} from './defs.js'

export type ToolReply = z.output<NonNullable<(typeof DESIGN_TOOLS)[number]['outputSchema']>>
