import {SquareTerminal} from 'lucide-solid'
import type {ComposerActionDef} from '../shell/widget-shell.js'

export function makeOpenInTerminalAction(harnessName: string): ComposerActionDef {
  return {
    id: 'open-in-terminal',
    label: `Open in ${harnessName}`,
    icon: SquareTerminal,
    onClick: async (ctx) => {
      ctx.setBusy(true)
      try {
        const model = ctx.requestMeta().model
        const res = await ctx.client.launch({
          model: typeof model === 'string' ? model : undefined,
        })
        if (!res.supported || !res.command) {
          ctx.notify(`${harnessName} can’t be opened in a terminal.`)
          return
        }
        if (res.opened) {
          ctx.notify(`Opened in ${harnessName}.`)
          return
        }
        try {
          await navigator.clipboard.writeText(res.command)
          ctx.notify('Command copied — paste it in your terminal.')
        } catch {
          ctx.notify(`Run in your terminal: ${res.command}`)
        }
      } catch {
        ctx.notify(`Couldn’t open ${harnessName}.`)
      } finally {
        ctx.setBusy(false)
      }
    },
  }
}
