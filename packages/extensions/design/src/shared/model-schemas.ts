import {z} from 'zod'
import {BoxSchema} from './defs.js'
import {ROLES} from './roles.js'
import type {Box, TargetNode} from './types.js'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ID_LENGTH = 8

const OcrLineSchema = z.object({box: BoxSchema, text: z.string(), confidence: z.number()})

const NodeBaseSchema = z.object({id: z.string(), box: BoxSchema, within: z.string().optional()})

const TextNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  lines: z.array(OcrLineSchema),
  confidence: z.number(),
  role: z.enum(ROLES).optional(),
  roleConfidence: z.number().optional(),
  typography: z
    .object({size: z.number(), lineHeight: z.number(), weight: z.number(), confidence: z.number()})
    .optional(),
})

const BoxNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('box'),
  paint: z.object({background: z.string()}).optional(),
  border: z.object({width: z.number(), color: z.string()}).nullable(),
  radius: z.number(),
})

const ImageNodeSchema = NodeBaseSchema.extend({kind: z.literal('image')})

const TargetNodeSchema = z.discriminatedUnion('kind', [TextNodeSchema, BoxNodeSchema, ImageNodeSchema])

export const ModelSchema = z.object({
  id: z.string(),
  source: z.object({kind: z.string(), ref: z.string()}),
  viewport: z.object({width: z.number(), height: z.number()}),
  root: z.object({id: z.string(), box: BoxSchema}),
  nodes: z.array(TargetNodeSchema),
  scale: z.number(),
})

function fnv(text: string): string {
  const hash = [...text].reduce(
    (state, character) => Math.imul(state ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )
  return hash.toString(16).padStart(ID_LENGTH, '0')
}

export function nodeId(input: {kind: TargetNode['kind']; box: Box; text?: string}): string {
  const {kind, box} = input
  const rounded = [box.x, box.y, box.w, box.h].map(Math.round).join(',')
  return fnv(`${kind}|${rounded}|${input.text ?? ''}`)
}
