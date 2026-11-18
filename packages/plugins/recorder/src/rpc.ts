import {Rpc} from '@conciv/plugin/rpc'
import {z} from 'zod'
import {MAX_FLUSH_BYTES, RecorderControlSchema, RrwebEventSchema, jsonByteLength, recorderConfig} from './protocol.js'

const ClientId = z.string().min(1).max(128)

const RangeInput = z.object({fromTs: z.number().optional(), toTs: z.number().optional(), clientId: ClientId})

const MAX_FLUSH_EVENTS = 5000

const FlushInput = z
  .object({clientId: ClientId, events: z.array(RrwebEventSchema).max(MAX_FLUSH_EVENTS)})
  .refine((input) => jsonByteLength(input.events) <= MAX_FLUSH_BYTES)

const NoInput = z.unknown()

const OkOutput = z.object({ok: z.literal(true)})

const EventWindow = z.object({events: z.array(RrwebEventSchema), cursor: z.number()})

const ActionLogEntrySchema = z.object({
  ts: z.number(),
  kind: z.enum(['click', 'input', 'navigation', 'scroll', 'console', 'reload']),
  detail: z.string(),
})

const SaveOutput = z.union([
  z.object({saved: z.literal(true), recordingId: z.string(), summary: z.string()}),
  z.object({saved: z.literal(false), error: z.enum(['too-large', 'empty', 'io-error'])}),
])

export const MAX_FILE_BYTES = 5 * 1024 * 1024

const VideoPieceOutput = z.strictObject({
  data: z.base64().max(Math.ceil(MAX_FILE_BYTES / 3) * 4),
  eof: z.boolean(),
  name: z.literal('recording.webm'),
  mime: z.literal('video/webm'),
})

const RecordingOutput = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('found'), events: z.array(RrwebEventSchema)}),
  z.object({kind: z.literal('expired')}),
  z.object({kind: z.literal('missing')}),
])

export const Recorder = Rpc.define({
  id: 'recorder',
  methods: {
    config: {input: NoInput, output: recorderConfig},
    clients: {input: NoInput, output: z.object({clients: z.array(z.object({id: z.string(), lastSeen: z.number()}))})},
    flush: {input: FlushInput, output: OkOutput},
    window: {input: RangeInput, output: EventWindow},
    since: {input: z.object({clientId: ClientId, cursor: z.number().int().nonnegative()}), output: EventWindow},
    state: {input: NoInput, output: z.object({live: z.boolean()})},
    presence: {input: z.object({viewerId: z.string().min(1).max(128), live: z.boolean()}), output: OkOutput},
    reset: {input: NoInput, output: OkOutput},
    log: {input: RangeInput, output: z.object({entries: z.array(ActionLogEntrySchema)})},
    'recordings.save': {input: RangeInput, output: SaveOutput},
    'recordings.get': {input: z.object({recordingId: z.string()}), output: RecordingOutput},
    'recordings.exportVideo': {
      input: z.object({clientId: ClientId, id: z.string().min(1).max(256), offset: z.number().int().nonnegative()}),
      output: VideoPieceOutput,
      errors: {expired: z.undefined(), missing: z.undefined(), 'render-failed': z.undefined()},
    },
  },
  events: {
    control: {schema: RecorderControlSchema},
    appended: {schema: z.object({clientId: z.string(), cursor: z.number()})},
  },
})
