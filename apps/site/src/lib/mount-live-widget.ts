import {dismissTry, getTrySession} from './try-session.functions'
import {shouldAutoOpen} from './try-state'

function ensureWidgetMeta(defaultOpen: boolean): void {
  if (document.querySelector('meta[name="pw-widget"]')) return
  const meta = document.createElement('meta')
  meta.name = 'pw-widget'
  meta.content = JSON.stringify({defaultOpen})
  document.head.appendChild(meta)
}

export async function mountLiveWidget(): Promise<void> {
  if (document.querySelector('[data-conciv-root]')) return
  const {token, dismissed} = await getTrySession()
  const tryParam = new URLSearchParams(window.location.search).get('try') === '1'
  const defaultOpen = shouldAutoOpen({tryParam, dismissed, widgetPresent: false}) || tryParam
  ensureWidgetMeta(defaultOpen)

  const [embed, terminal, tryItModule] = await Promise.all([
    import('@conciv/embed'),
    import('@conciv/extension-terminal/client'),
    import('@conciv/extension-try-it/client'),
  ])
  if (document.querySelector('[data-conciv-root]')) return
  embed.mountConciv([terminal.default, tryItModule.tryIt({token})])
  window.dispatchEvent(new Event('conciv:widget-mounted'))

  window.addEventListener('conciv:panel-toggled', (event) => {
    const detail = (event as CustomEvent<{open: boolean; connected: boolean}>).detail
    if (detail && !detail.open && !detail.connected) void dismissTry().catch(() => {})
  })
}
