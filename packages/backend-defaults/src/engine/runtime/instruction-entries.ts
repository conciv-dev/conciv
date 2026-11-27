import {InstructionEntry, InstructionEntrySchema, Instructions, KV} from '@conciv/backend-app-api'
import {Effect, Layer, Schema} from 'effect'
import {instructionsErrors} from '@conciv/errors'

const ENTRY_PREFIX = 'conciv.instruction-entry:'
const SCAN_LIMIT = 1000

const StoredEntry = Schema.Struct({value: Schema.Json, removed: Schema.Boolean})

type Entry = typeof StoredEntry.Type & {readonly key: InstructionEntry.Key}

const sessionPrefix = (sessionId: string): string => `${ENTRY_PREFIX}${sessionId}:`

const scanAll = Effect.fn('core.instructionEntries.scan')(function* (
  kv: KV.Interface,
  prefix: string,
  after?: string,
): Effect.fn.Return<ReadonlyArray<KV.Entry>> {
  const page = yield* kv.scan({prefix, after, limit: SCAN_LIMIT})
  if (page.next === undefined) return page.entries
  return [...page.entries, ...(yield* scanAll(kv, prefix, page.next))]
})

const readEntries = Effect.fn('core.instructionEntries.read')(function* (
  kv: KV.Interface,
  sessionId: string,
): Effect.fn.Return<ReadonlyArray<Entry>> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const prefix = sessionPrefix(sessionId)
  const rows = yield* scanAll(kv, prefix)
  return yield* Effect.forEach(rows, (row) =>
    Schema.decodeUnknownEffect(StoredEntry)(row.value).pipe(
      Effect.orDie,
      Effect.map((stored) => ({...stored, key: row.key.slice(prefix.length)})),
    ),
  )
})

const renderValue = (value: Schema.Json): string => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

const renderBlock = (key: string, value: Schema.Json): string =>
  [`<context key="${key}">`, renderValue(value), '</context>'].join('\n')

const entrySource = (entry: Entry): Instructions.List =>
  Instructions.make<Schema.Json>({
    key: Instructions.Key.make(`api/${entry.key}`),
    codec: Schema.toCodecJson(Schema.Json),
    read: Effect.succeed(entry.removed ? Instructions.removed : entry.value),
    render: {
      initial: (value) => renderBlock(entry.key, value),
      changed: (_previous, value) =>
        [
          `The context under "${entry.key}" changed and supersedes the previous value:`,
          renderBlock(entry.key, value),
        ].join('\n'),
      removed: () => `The context under "${entry.key}" no longer applies. Disregard it.`,
    },
  })

export const removeInstructionEntries = Effect.fn('core.instructionEntries.remove')(function* (
  kv: KV.Interface,
  sessionId: string,
): Effect.fn.Return<void> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const rows = yield* scanAll(kv, sessionPrefix(sessionId))
  yield* Effect.forEach(rows, (row) => kv.remove(row.key), {discard: true})
})

export const loadInstructionEntries = Effect.fn('core.instructionEntries.load')(function* (
  kv: KV.Interface,
  sessionId: string,
): Effect.fn.Return<Instructions.List> {
  yield* Effect.annotateCurrentSpan({sessionId})
  const entries = yield* readEntries(kv, sessionId)
  return Instructions.combine(entries.map(entrySource))
})

export const provideInstructionEntries = Layer.effect(
  InstructionEntry.Service,
  Effect.gen(function* () {
    const kv = yield* KV.Service
    return InstructionEntry.Service.of({
      list: (sessionId) =>
        readEntries(kv, sessionId).pipe(
          Effect.map((entries) => entries.filter((entry) => !entry.removed).map(({key, value}) => ({key, value}))),
        ),
      put: (input) => {
        const actualBytes = Buffer.byteLength(JSON.stringify(input.value), 'utf8')
        const maxBytes = InstructionEntrySchema.MaxValueBytes
        if (actualBytes > maxBytes) return Effect.fail(instructionsErrors.VALUE_TOO_LARGE({actualBytes, maxBytes}))
        return kv.set(sessionPrefix(input.sessionId) + input.key, {value: input.value, removed: false})
      },
      remove: (input) => {
        const key = sessionPrefix(input.sessionId) + input.key
        return kv
          .get(key)
          .pipe(
            Effect.flatMap((stored) =>
              stored === undefined ? Effect.void : kv.set(key, {value: null, removed: true}),
            ),
          )
      },
    })
  }),
)
