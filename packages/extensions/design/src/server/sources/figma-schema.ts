import {z} from 'zod'

const ColorSchema = z.looseObject({r: z.number(), g: z.number(), b: z.number(), a: z.number().optional()})
const PointSchema = z.looseObject({x: z.number(), y: z.number()})
const PaintSchema = z.looseObject({
  type: z.string(),
  visible: z.boolean().optional(),
  color: ColorSchema.optional(),
  opacity: z.number().optional(),
  gradientStops: z.array(z.looseObject({color: ColorSchema, position: z.number()})).optional(),
  gradientHandlePositions: z.array(PointSchema).optional(),
})
const AliasSchema = z.looseObject({id: z.string()})
const BoundSchema = z.record(z.string(), z.union([AliasSchema, z.array(AliasSchema)]))
const BoundsSchema = z.looseObject({x: z.number(), y: z.number(), width: z.number(), height: z.number()})
const FigmaNodeSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  visible: z.boolean().optional(),
  absoluteBoundingBox: BoundsSchema.nullable().optional(),
  characters: z.string().optional(),
  style: z
    .looseObject({
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      fontWeight: z.number().optional(),
      fontStyle: z.string().optional(),
      italic: z.boolean().optional(),
      lineHeightPx: z.number().optional(),
      lineHeightUnit: z.string().optional(),
      lineHeightPercentFontSize: z.number().optional(),
      letterSpacing: z.number().optional(),
      textAlignHorizontal: z.string().optional(),
      textCase: z.string().optional(),
      textDecoration: z.string().optional(),
    })
    .optional(),
  fills: z.array(PaintSchema).optional(),
  strokes: z.array(PaintSchema).optional(),
  strokeWeight: z.number().optional(),
  cornerRadius: z.number().optional(),
  rectangleCornerRadii: z.array(z.number()).optional(),
  layoutMode: z.string().optional(),
  layoutWrap: z.string().optional(),
  itemSpacing: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  counterAxisAlignItems: z.string().optional(),
  primaryAxisAlignItems: z.string().optional(),
  primaryAxisSizingMode: z.string().optional(),
  counterAxisSizingMode: z.string().optional(),
  layoutAlign: z.string().optional(),
  constraints: z.looseObject({horizontal: z.string().optional(), vertical: z.string().optional()}).optional(),
  clipsContent: z.boolean().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  minWidth: z.number().nullable().optional(),
  maxWidth: z.number().nullable().optional(),
  layoutPositioning: z.string().optional(),
  layoutSizingHorizontal: z.string().optional(),
  layoutSizingVertical: z.string().optional(),
  layoutGrow: z.number().optional(),
  boundVariables: BoundSchema.optional().catch(undefined),
  get children() {
    return z.array(FigmaNodeSchema).optional()
  },
})
const FigmaDocumentSchema = z.looseObject({
  nodes: z.record(z.string(), z.looseObject({document: FigmaNodeSchema}).nullable()),
  version: z.string().optional(),
  lastModified: z.string().optional(),
})
const FigmaImagesSchema = z.looseObject({images: z.record(z.string(), z.string().nullable())})

export const figmaSchemas = {
  color: ColorSchema,
  point: PointSchema,
  paint: PaintSchema,
  bounds: BoundsSchema,
  node: FigmaNodeSchema,
  document: FigmaDocumentSchema,
  images: FigmaImagesSchema,
}
