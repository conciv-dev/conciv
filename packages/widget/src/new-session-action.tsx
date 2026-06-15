import {SquarePen} from 'lucide-solid'
import {createChatApi} from './chat-api.js'
import type {ComposerActionDef} from './widget-shell.js'

// New session: forget the server's resume pointer, then mark a boundary in the scrollback and clear
// the context tracker. The prior thread stays on screen above the divider (scrollable, Claude-Code
// style); the next message streams below it as a fresh session. Harness-agnostic — "fresh" is just
// the absence of resume, which every harness supports.
export const newSessionAction: ComposerActionDef = {
  id: 'new-session',
  label: 'Start a new session',
  icon: SquarePen,
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      await createChatApi({apiBase: ctx.apiBase}).newSession()
      ctx.addDivider('new')
      ctx.resetUsage()
    } finally {
      ctx.setBusy(false)
    }
  },
}
