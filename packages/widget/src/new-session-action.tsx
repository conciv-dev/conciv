import {SquarePen} from 'lucide-solid'
import type {ComposerActionDef} from './widget-shell.js'

// New session: resolve a fresh aidx_ session and make it active, then mark a boundary in the
// scrollback and clear the context tracker. The prior thread stays on screen above the divider
// (scrollable, Claude-Code style); the next message streams below it as a fresh session.
export const newSessionAction: ComposerActionDef = {
  id: 'new-session',
  label: 'Start a new session',
  icon: SquarePen,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      await ctx.newSession()
      ctx.addDivider('new')
      ctx.resetUsage()
    } finally {
      ctx.setBusy(false)
    }
  },
}
