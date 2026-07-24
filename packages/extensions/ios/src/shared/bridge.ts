import {z} from 'zod'
import type {ElementRect, ElementSource, ImagePreview} from '@conciv/grab'

export const BRIDGE_MIN_VERSION = 1
export const BRIDGE_MAX_VERSION = 1

const VersionSchema = z.number().int()
const SeqSchema = z.number().int()

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
}) satisfies z.ZodType<ElementRect>

export const SourceSchema = z.object({
  componentName: z.string().nullable(),
  filePath: z.string(),
  lineNumber: z.number().nullable(),
}) satisfies z.ZodType<ElementSource>

export const GrabImagePreviewSchema = z.object({
  kind: z.literal('image'),
  dataUrl: z.string(),
  width: z.number(),
  height: z.number(),
}) satisfies z.ZodType<ImagePreview>

export type ViewNode = {
  class: string
  a11yId: string | null
  text: string | null
  rect: ElementRect
  children: ViewNode[]
}

export const ViewNodeSchema: z.ZodType<ViewNode> = z.lazy(() =>
  z.object({
    class: z.string(),
    a11yId: z.string().nullable(),
    text: z.string().nullable(),
    rect: RectSchema,
    children: z.array(ViewNodeSchema),
  }),
)

export const NeutralGrabSchema = z.object({
  text: z.string(),
  preview: GrabImagePreviewSchema,
  rect: RectSchema.nullable(),
  source: SourceSchema.nullable(),
  subtree: ViewNodeSchema.optional(),
})

export type NeutralGrab = z.infer<typeof NeutralGrabSchema>

export type NeutralGrabAsGrab = Omit<NeutralGrab, 'subtree'>

export const GrabModeSchema = z.enum(['activate', 'comment'])
export type GrabMode = z.infer<typeof GrabModeSchema>

export const BridgeReadySchema = z.object({
  v: VersionSchema,
  type: z.literal('bridge.ready'),
})

export const HandshakeHelloSchema = z.object({
  v: VersionSchema,
  type: z.literal('handshake.hello'),
  minV: VersionSchema,
  maxV: VersionSchema,
  clientId: z.string(),
  bundleReady: z.boolean(),
})

export const GrabPickSchema = z.object({
  v: VersionSchema,
  type: z.literal('grab.pick'),
  requestId: z.string(),
  mode: GrabModeSchema,
})

export const GrabCancelSchema = z.object({
  v: VersionSchema,
  type: z.literal('grab.cancel'),
  requestId: z.string(),
})

export const BridgeAckSchema = z.object({
  v: VersionSchema,
  type: z.literal('bridge.ack'),
  seq: SeqSchema,
})

export const HostPanelToggledSchema = z.object({
  v: VersionSchema,
  type: z.literal('host.panelToggled'),
  open: z.boolean(),
  connected: z.boolean(),
  mascotRect: RectSchema.optional(),
})

export const HostLogSchema = z.object({
  v: VersionSchema,
  type: z.literal('host.log'),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
})

export const HandshakeSchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('handshake'),
  apiBase: z.string(),
  token: z.string().nullable(),
})

export const BridgeIncompatibleSchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('bridge.incompatible'),
  nativeMinV: VersionSchema,
  nativeMaxV: VersionSchema,
})

export const OpenSchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('open'),
})

export const CloseSchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('close'),
})

export const GrabResultSchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('grabResult'),
  requestId: z.string(),
  grab: NeutralGrabSchema.nullable(),
})

export const GrabCapabilitySchema = z.object({
  v: VersionSchema,
  seq: SeqSchema,
  type: z.literal('grabCapability'),
  grabbable: z.boolean(),
})

export const PageToNativeSchema = z.discriminatedUnion('type', [
  BridgeReadySchema,
  HandshakeHelloSchema,
  GrabPickSchema,
  GrabCancelSchema,
  BridgeAckSchema,
  HostPanelToggledSchema,
  HostLogSchema,
])

export const NativeToPageSchema = z.discriminatedUnion('type', [
  HandshakeSchema,
  BridgeIncompatibleSchema,
  OpenSchema,
  CloseSchema,
  GrabResultSchema,
  GrabCapabilitySchema,
])

export const BridgeMessageSchema = z.discriminatedUnion('type', [
  BridgeReadySchema,
  HandshakeHelloSchema,
  GrabPickSchema,
  GrabCancelSchema,
  BridgeAckSchema,
  HostPanelToggledSchema,
  HostLogSchema,
  HandshakeSchema,
  BridgeIncompatibleSchema,
  OpenSchema,
  CloseSchema,
  GrabResultSchema,
  GrabCapabilitySchema,
])

export const bridgeMessageSchemasByType = {
  'bridge.ready': BridgeReadySchema,
  'handshake.hello': HandshakeHelloSchema,
  'grab.pick': GrabPickSchema,
  'grab.cancel': GrabCancelSchema,
  'bridge.ack': BridgeAckSchema,
  'host.panelToggled': HostPanelToggledSchema,
  'host.log': HostLogSchema,
  handshake: HandshakeSchema,
  'bridge.incompatible': BridgeIncompatibleSchema,
  open: OpenSchema,
  close: CloseSchema,
  grabResult: GrabResultSchema,
  grabCapability: GrabCapabilitySchema,
}

export type PageToNativeMessage = z.infer<typeof PageToNativeSchema>
export type NativeToPageMessage = z.infer<typeof NativeToPageSchema>
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>

export type BridgeReady = z.infer<typeof BridgeReadySchema>
export type HandshakeHello = z.infer<typeof HandshakeHelloSchema>
export type GrabPick = z.infer<typeof GrabPickSchema>
export type GrabCancel = z.infer<typeof GrabCancelSchema>
export type BridgeAck = z.infer<typeof BridgeAckSchema>
export type HostPanelToggled = z.infer<typeof HostPanelToggledSchema>
export type HostLog = z.infer<typeof HostLogSchema>
export type Handshake = z.infer<typeof HandshakeSchema>
export type BridgeIncompatible = z.infer<typeof BridgeIncompatibleSchema>
export type Open = z.infer<typeof OpenSchema>
export type Close = z.infer<typeof CloseSchema>
export type GrabResult = z.infer<typeof GrabResultSchema>
export type GrabCapability = z.infer<typeof GrabCapabilitySchema>
