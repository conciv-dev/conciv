import {PANEL_TOGGLED_EVENT, type WidgetPanelToggledDetail} from '@conciv/protocol/event-bus'
import {dismissTry, getTrySession} from './try-session.functions'
import {shouldAutoOpen, shouldDismissOnClose} from './try-state'

declare global {
  interface WindowEventMap {
    [PANEL_TOGGLED_EVENT]: CustomEvent<WidgetPanelToggledDetail>
  }
}

function ensureWidgetMeta(defaultOpen: boolean): void {
  if (document.querySelector('meta[name="conciv-widget"]')) return
  const meta = document.createElement('meta')
  meta.name = 'conciv-widget'
  meta.content = JSON.stringify({defaultOpen})
  document.head.appendChild(meta)
}

export async function mountLiveWidget(opts: {widgetOpen: boolean; tryParam: boolean}): Promise<void> {
  if (document.querySelector('[data-conciv-root]')) return
  const {token, dismissed} = await getTrySession()
  const defaultOpen =
    shouldAutoOpen({widgetOpen: opts.widgetOpen, tryParam: opts.tryParam, dismissed, widgetPresent: false}) ||
    opts.tryParam
  ensureWidgetMeta(defaultOpen)

  const [embed, terminal, tryItModule] = await Promise.all([
    import('@conciv/embed'),
    import('@conciv/extension-terminal/client'),
    import('@conciv/extension-try-it/client'),
  ])
  if (document.querySelector('[data-conciv-root]')) return
  await embed.mountConciv([terminal.default, tryItModule.tryIt({token})])

  let hasBeenOpen = false
  window.addEventListener(PANEL_TOGGLED_EVENT, (event) => {
    const detail = event.detail
    if (!detail) return
    if (detail.open) {
      hasBeenOpen = true
      return
    }
    if (shouldDismissOnClose({hasBeenOpen, connected: detail.connected})) void dismissTry().catch(() => {})
  })
}
