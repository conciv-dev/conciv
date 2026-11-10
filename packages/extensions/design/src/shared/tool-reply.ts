import type {z} from 'zod'
import type {DESIGN_TOOLS} from './design-tools.js'

export type ToolReply = z.output<NonNullable<(typeof DESIGN_TOOLS)[number]['outputSchema']>>
