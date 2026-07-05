import {FoldVertical} from 'lucide-solid'
import type {ComposerActionDef} from '../shell/shell-contract.js'

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
