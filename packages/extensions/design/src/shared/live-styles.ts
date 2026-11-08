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
  border: z.object({width: z.number(), style: z.string(), color: z.string(), side: z.enum(BORDER_SIDES)}),
  gradient: z.object({from: z.string(), to: z.string()}).nullable().default(null),
  opacity: z.number().optional(),
  image: z.string().optional().describe('the src of an img, else the url of the background image'),
})
