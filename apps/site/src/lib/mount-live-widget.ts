import {dismissTry, getTrySession} from './try-session.functions'
import {shouldAutoOpen, shouldDismissOnClose} from './try-state'

function ensureWidgetMeta(defaultOpen: boolean): void {
  if (document.querySelector('meta[name="pw-widget"]')) return
  const meta = document.createElement('meta')
  meta.name = 'pw-widget'
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
  const root = document.createElement('div')
  root.setAttribute('data-conciv-script-root', '')
  document.body.appendChild(root)
  await embed.createConciv({extensions: [terminal.default, tryItModule.tryIt({token})]}).mount(root)
  window.dispatchEvent(new Event('conciv:widget-mounted'))

  let hasBeenOpen = false
  window.addEventListener('conciv:panel-toggled', (event) => {
    const detail = (event as CustomEvent<{open: boolean; connected: boolean}>).detail
    if (!detail) return
    if (detail.open) {
      hasBeenOpen = true
      return
    }
    if (shouldDismissOnClose({hasBeenOpen, connected: detail.connected})) void dismissTry().catch(() => {})
  })
}
