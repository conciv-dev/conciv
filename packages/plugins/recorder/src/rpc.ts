import {Rpc} from '@conciv/plugin/rpc'
import {z} from 'zod'
import {
  MAX_FLUSH_BYTES,
  RecorderControlSchema,
  RrwebEventSchema,
  jsonByteLength,
  recorderConfig,
} from './shared/protocol.js'

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
  z.object({recordingId: z.string()}),
  z.object({error: z.enum(['too-large', 'empty', 'io-error'])}),
])

const RecordingOutput = z.union([z.object({events: z.array(RrwebEventSchema)}), z.object({expired: z.literal(true)})])

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
  },
  events: {
    control: {schema: RecorderControlSchema},
    appended: {schema: z.object({clientId: z.string(), cursor: z.number()})},
  },
})
