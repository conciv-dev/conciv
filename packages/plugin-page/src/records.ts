import {Effect} from 'effect'
import {z} from 'zod'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  PageCaptureBundleSchema,
  type PageCaptureBundle,
  type SessionCaptures,
} from '@conciv/protocol/element-capture-types'
import {PageChangeEntrySchema, type PageChangeEntry} from '@conciv/protocol/page-types'
import type {StorageEntry} from '@conciv/plugin/effect'
import type {Context} from '@conciv/plugin/effect/plugin'

const Change = PageChangeEntrySchema.omit({seq: true})
const Stored = z.json()

export function fromStorage(storage: Context['storage']) {
  const every = (prefix: string, after?: string): Effect.Effect<StorageEntry[]> =>
    storage
      .scan({prefix, ...(after === undefined ? {} : {after})})
      .pipe(
        Effect.flatMap((page) =>
          page.next === undefined
            ? Effect.succeed([...page.entries])
            : every(prefix, page.next).pipe(Effect.map((rest) => [...page.entries, ...rest])),
        ),
      )
  const remove = (entries: readonly StorageEntry[]) =>
    Effect.forEach(entries, (entry) => storage.remove(entry.key), {concurrency: 'unbounded', discard: true})
  return {
    append: (sessionId: SessionId, change: Omit<PageChangeEntry, 'seq'>) =>
      Effect.suspend(() =>
        storage.set(
          `changes/${sessionId}/${String(change.ts).padStart(16, '0')}-${crypto.randomUUID()}`,
          Stored.parse(change),
        ),
      ),
    changes: (sessionId: SessionId): Effect.Effect<PageChangeEntry[]> =>
      every(`changes/${sessionId}/`).pipe(
        Effect.map((entries) => entries.map((entry, index) => ({...Change.parse(entry.value), seq: index + 1}))),
      ),
    capture: (sessionId: SessionId, toolCallId: string, bundle: PageCaptureBundle) =>
      Effect.suspend(() => storage.set(`captures/${sessionId}/${toolCallId}`, Stored.parse(bundle))),
    captures: (sessionId: SessionId): Effect.Effect<SessionCaptures> =>
      every(`captures/${sessionId}/`).pipe(
        Effect.map((entries) => {
          const stored = entries.map((entry) => ({
            toolCallId: entry.key.slice(`captures/${sessionId}/`.length),
            bundle: PageCaptureBundleSchema.parse(entry.value),
          }))
          return {
            captures: stored.flatMap(({toolCallId, bundle}) =>
              [bundle.before, bundle.after].flatMap((capture) =>
                capture ? [{toolCallId, kind: capture.kind, capture}] : [],
              ),
            ),
            cssBundles: Object.fromEntries(
              stored.flatMap(({bundle}) => (bundle.cssBundles ?? []).map((css) => [css.hash, css.css])),
            ),
          }
        }),
      ),
    clear: (sessionId: SessionId) => every(`changes/${sessionId}/`).pipe(Effect.flatMap(remove)),
    forget: (sessionId: SessionId) =>
      Effect.all([every(`changes/${sessionId}/`), every(`captures/${sessionId}/`)]).pipe(
        Effect.flatMap(([changes, captures]) => remove([...changes, ...captures])),
      ),
  }
}
