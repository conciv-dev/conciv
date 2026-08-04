import {z} from 'zod'
import {debounce} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'

const WRITE_DELAY_MS = 300

const PersistedDraftSchema = z.object({
  text: z.string().catch(''),
  grabs: z.array(z.string()).catch([]),
})

type PersistedDraft = z.infer<typeof PersistedDraftSchema>

function parseDraft(raw: string): PersistedDraft | null {
  try {
    const parsed = PersistedDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function makeDraftStorage(rpc: RpcClient, sessionId: string): Promise<WebStorage> {
  const row = await rpc.drafts.get({sessionId}).catch(() => null)
  let cache = row ? JSON.stringify({text: row.text, quote: null, grabs: row.grabs, attachments: []}) : null
  const write = debounce(
    (draft: PersistedDraft) => {
      void rpc.drafts
        .set({
          sessionId,
          text: draft.text,
          selectionStart: draft.text.length,
          selectionEnd: draft.text.length,
          grabs: draft.grabs,
        })
        .catch(() => {})
    },
    {wait: WRITE_DELAY_MS},
  )
  return {
    getItem: () => cache,
    setItem: (_key, value) => {
      cache = value
      const parsed = parseDraft(value)
      if (parsed) write(parsed)
    },
  }
}
