import type {DraftRow} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import type {EmbedKit} from '../../helpers/boot.js'

export function untilPanelDraft(
  kit: EmbedKit,
  sessionId: string,
  matches: (draft: DraftRow) => boolean,
): Promise<void> {
  return until(
    async () => {
      const draft = await kit.rpc.drafts.get({sessionId})
      return draft !== null && matches(draft)
    },
    {hangGuardMs: 30_000, intervalMs: 100},
  )
}
