import {Rpc} from '@conciv/plugin/rpc'
import {z} from 'zod'
import {TestEventSchema, TestRunResultSchema} from './shared/events.js'

export const ListResultSchema = z.object({
  files: z.array(z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})),
})

const UiServerInfoSchema = z.object({available: z.boolean(), url: z.string().optional()})

const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

const ListInputSchema = z.object({failedOnly: z.boolean().default(false)})

const NoInputSchema = z.unknown()

const unavailable = {UNAVAILABLE: z.object({available: z.literal(false), error: z.string()})}

export const TestRunner = Rpc.define({
  id: 'test-runner',
  methods: {
    status: {input: NoInputSchema, output: TestRunResultSchema},
    list: {input: ListInputSchema, output: ListResultSchema, errors: unavailable},
    ui: {input: NoInputSchema, output: UiServerInfoSchema, errors: unavailable},
    run: {input: RunArgsSchema, output: TestRunResultSchema, errors: unavailable},
    stop: {input: NoInputSchema, output: z.object({ok: z.boolean()})},
  },
  events: {event: {schema: TestEventSchema}},
})
