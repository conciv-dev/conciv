import {z} from 'zod'

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

const SizingSchema = z.enum(['fixed', 'set', 'auto'])

export const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number().nullable().describe('the computed line-height in px, null when it is normal'),
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
      .describe('every visible side with its width; an outline draws all four'),
  }),
  gradient: z.object({from: z.string(), to: z.string()}).nullable().default(null),
  shadows: z
    .array(
      z.object({
        inset: z.boolean(),
        x: z.number(),
        y: z.number(),
        blur: z.number(),
        spread: z.number(),
        color: z.string(),
      }),
    )
    .default([])
    .describe('every box-shadow and text-shadow, in px'),
  blur: z
    .object({layer: z.number(), background: z.number()})
    .default({layer: 0, background: 0})
    .describe('the px radius of blur() in filter and in backdrop-filter'),
  opacity: z.number().optional(),
  image: z.string().optional().describe('the src of an img, else the url of the background image'),
  media: z
    .record(z.string(), z.string())
    .default({})
    .describe('by CSS property, the @media condition of the winning declaration, when it sits in one'),
})
