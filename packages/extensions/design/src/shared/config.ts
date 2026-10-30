import {z} from 'zod'

export const designConfig = z.object({
  comparator: z.enum(['blazediff', 'pixelmatch']).default('blazediff'),
  geometry: z.enum(['edge-projection']).default('edge-projection'),
  color: z.enum(['ciede2000']).default('ciede2000'),
  capture: z.enum(['tab']).default('tab'),
  matcher: z.enum(['tile']).default('tile'),
})

export type DesignConfig = z.output<typeof designConfig>
