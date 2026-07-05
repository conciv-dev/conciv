import {SquarePen} from 'lucide-solid'
import type {ComposerActionDef} from '../shell/shell-contract.js'

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
