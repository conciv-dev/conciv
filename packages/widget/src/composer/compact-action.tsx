import {FoldVertical} from 'lucide-solid'
import type {ComposerActionDef} from '../shell/widget-shell.js'

// Compress the conversation. ctx.compact() runs the compaction turn OUT OF BAND, so the thread shows
// only a boundary divider — no '/compact' command, no summary — matching Claude Code. Server-side
// it's tiered: claude runs native /compact (frees the context window); harnesses without native
// compaction run a summarize turn whose output is drained and discarded.
export const compactAction: ComposerActionDef = {
  id: 'compact',
  label: 'Compress the conversation',
  icon: FoldVertical,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      await ctx.compact()
    } finally {
      ctx.setBusy(false)
    }
  },
}
