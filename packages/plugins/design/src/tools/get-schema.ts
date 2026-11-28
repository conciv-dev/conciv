import {z} from 'zod'
import {BoxSchema, ReflowTagSchema} from '../model/design.js'

const LinksSchema = z.union([z.url(), z.array(z.url()).min(1)])

const PathsSchema = z.union([z.string(), z.array(z.string()).min(1)])

export const GetInputSchema = z
  .object({
    figma: LinksSchema.optional().describe('the Figma frame link, with its node-id; a list, one link per width'),
    document: z
      .unknown()
      .optional()
      .describe(
        'the frame REST nodes document (GET /v1/files/:key/nodes?ids=:id), as JSON or the path of a .json file, when the engine has no Figma key; a list, one per link',
      ),
    image: PathsSchema.optional().describe(
      'path of the frame PNG, or the PNG as base64, that goes with document; a list, one per link',
    ),
    route: z.string().optional().describe('the path of the page the design is for, such as /pricing'),
  })
  .refine((input) => input.document === undefined || (input.figma !== undefined && input.image !== undefined), {
    message: 'document goes with figma and image',
  })

const TaggedNodeSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    within: z.string().nullable(),
    depth: z.number(),
    box: BoxSchema,
    implied: z.boolean().optional(),
    reflow: ReflowTagSchema.optional(),
  })
  .loose()

const GetResultSchema = z.object({
  target: z.string(),
  root: z.string(),
  count: z.number(),
  viewport: z.object({width: z.number(), height: z.number()}),
  rules: z.array(z.string()),
  nodes: z.array(TaggedNodeSchema),
})

export const GetReplySchema = z.union([GetResultSchema, z.object({variants: z.array(GetResultSchema)})])

export type GetInput = z.output<typeof GetInputSchema>

export type Got = z.output<typeof GetResultSchema>

export type TaggedNode = z.output<typeof TaggedNodeSchema>
