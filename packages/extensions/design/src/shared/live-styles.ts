import {z} from 'zod'

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

const SizingSchema = z.enum(['fixed', 'set', 'auto'])

export const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  fontWeight: z.number(),
  fontFamily: z.string(),
  textAlign: z.string().describe('the computed text-align'),
  radius: z.number(),
  position: z.string(),
  display: z.string().default(''),
  flexDirection: z.string().default(''),
  overflowX: z.string().default('visible'),
  sizing: z.object({width: SizingSchema, height: SizingSchema}).describe('fixed: own px rule, set: any other size'),
  border: z.object({
    width: z.number(),
    style: z.string(),
    color: z.string(),
    side: z.enum(BORDER_SIDES).describe('the widest visible side, the first on a tie'),
    sides: z
      .array(z.object({side: z.enum(BORDER_SIDES), width: z.number()}))
      .default([])
      .describe('every visible side with its width'),
  }),
  gradient: z.object({from: z.string(), to: z.string()}).nullable().default(null),
  opacity: z.number().optional(),
  image: z.string().optional().describe('the src of an img, else the url of the background image'),
  media: z
    .record(z.string(), z.string())
    .default({})
    .describe('by CSS property, the @media condition of the winning declaration, when it sits in one'),
})
