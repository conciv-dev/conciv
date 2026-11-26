import type {ParsedLocation, RegisteredRouter} from '@tanstack/react-router'
import type {PluginEntry} from '@conciv/app'
import {PANEL_TOGGLED_EVENT, type WidgetPanelToggledDetail} from '@conciv/types/event-bus'
import {panelCommands} from './panel-commands'
import {rootSearchSchema} from './search-schemas'
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

function tryRequested(location: ParsedLocation | undefined): boolean {
  if (location === undefined) return false
  return rootSearchSchema.parse(location.search).try === 1
}

function followTryParam(router: RegisteredRouter): void {
  router.subscribe('onResolved', ({fromLocation, toLocation}) => {
    const isRequested = tryRequested(toLocation)
    if (isRequested === tryRequested(fromLocation)) return
    panelCommands.emit(isRequested ? 'open' : 'close', undefined)
  })
}

function clearTryParam(router: RegisteredRouter): void {
  if (!tryRequested(router.state.location)) return
  void router
    .navigate({to: '.', search: (previous) => ({...previous, try: undefined}), replace: true, resetScroll: false})
    .catch((error: unknown) => console.error('conciv try param could not be cleared', error))
}

export async function mountLiveWidget(opts: {widgetOpen: boolean; router: RegisteredRouter}): Promise<void> {
  if (document.querySelector('[data-conciv-root]')) return
  const tryParam = tryRequested(opts.router.state.location)
  followTryParam(opts.router)
  const {token, dismissed} = await getTrySession()
  const defaultOpen =
    shouldAutoOpen({widgetOpen: opts.widgetOpen, tryParam, dismissed, widgetPresent: false}) || tryParam
  ensureWidgetMeta(defaultOpen)

  const [embed, tryIt, host] = await Promise.all([
    import('@conciv/app'),
    import('@conciv/plugin-try-it'),
    import('@conciv/frontend-plugin-api/host'),
  ])
  if (document.querySelector('[data-conciv-root]')) return
  const setup = tryIt.default.setup
  if (setup === undefined) throw new Error('conciv try-it plugin has no setup')
  const plugins = host
    .compose({
      'try-it': {...tryIt.default, windowEntry: async () => ({default: setup})},
    })
    .map((entry): PluginEntry => [entry, {token}])
  await embed.mountConciv(plugins)

  let hasBeenOpen = false
  window.addEventListener(PANEL_TOGGLED_EVENT, (event) => {
    const detail = event.detail
    if (!detail) return
    if (detail.open) {
      hasBeenOpen = true
      return
    }
    clearTryParam(opts.router)
    if (shouldDismissOnClose({hasBeenOpen, connected: detail.connected})) void dismissTry().catch(() => {})
  })
}
