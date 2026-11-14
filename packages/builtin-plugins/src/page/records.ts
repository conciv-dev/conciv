import {z} from 'zod'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  PageCaptureBundleSchema,
  type PageCaptureBundle,
  type SessionCaptures,
} from '@conciv/protocol/element-capture-types'
import {PageChangeEntrySchema, type PageChangeEntry} from '@conciv/protocol/page-types'
import type {Plugin, StorageEntry} from '@conciv/plugin'

const Change = PageChangeEntrySchema.omit({seq: true})
const Stored = z.json()

export function fromStorage(storage: Plugin.Context['storage']) {
  const every = async (prefix: string, after?: string): Promise<StorageEntry[]> => {
    const page = await storage.scan({prefix, ...(after === undefined ? {} : {after})})
    if (page.next === undefined) return [...page.entries]
    return [...page.entries, ...(await every(prefix, page.next))]
  }
  const remove = async (entries: readonly StorageEntry[]) => {
    await Promise.all(entries.map((entry) => storage.remove(entry.key)))
  }
  return {
    append: async (sessionId: SessionId, change: Omit<PageChangeEntry, 'seq'>) => {
      await storage.set(
        `changes/${sessionId}/${String(change.ts).padStart(16, '0')}-${crypto.randomUUID()}`,
        Stored.parse(change),
      )
    },
    changes: async (sessionId: SessionId): Promise<PageChangeEntry[]> =>
      (await every(`changes/${sessionId}/`)).map((entry, index) => ({...Change.parse(entry.value), seq: index + 1})),
    capture: async (sessionId: SessionId, toolCallId: string, bundle: PageCaptureBundle) => {
      await storage.set(`captures/${sessionId}/${toolCallId}`, Stored.parse(bundle))
    },
    captures: async (sessionId: SessionId): Promise<SessionCaptures> => {
      const stored = (await every(`captures/${sessionId}/`)).map((entry) => ({
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
    },
    clear: async (sessionId: SessionId) => remove(await every(`changes/${sessionId}/`)),
    forget: async (sessionId: SessionId) =>
      remove([...(await every(`changes/${sessionId}/`)), ...(await every(`captures/${sessionId}/`))]),
  }
}
