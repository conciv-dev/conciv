import type {DraftRow} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import type {EmbedKit} from '../../helpers/boot.js'
import {panelSessionId} from './navigation.js'

export async function panelDraft(kit: EmbedKit): Promise<DraftRow | null> {
  const sessionId = await panelSessionId(kit)
  if (!sessionId) return null
  return kit.rpc.drafts.get({sessionId})
}

export function untilPanelDraft(kit: EmbedKit, matches: (draft: DraftRow) => boolean): Promise<void> {
  return until(
    async () => {
      const draft = await panelDraft(kit)
      return draft !== null && matches(draft)
    },
    {hangGuardMs: 30_000, intervalMs: 100},
  )
}
