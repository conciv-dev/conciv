import {SquarePen} from 'lucide-solid'
import type {ComposerActionDef} from '../shell/widget-shell.js'

// New session: hand off to the surface (the modal opens a fresh pane; the quick-terminal starts a
// new session in place with a divider) and clear the context tracker.
export const newSessionAction: ComposerActionDef = {
  id: 'new-session',
  label: 'Start a new session',
  icon: SquarePen,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      await ctx.newSession()
      ctx.resetUsage()
    } finally {
      ctx.setBusy(false)
    }
  },
}
