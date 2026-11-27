import type {ParsedLocation, RegisteredRouter} from '@tanstack/react-router'
import type {ConcivHandle, PluginEntry} from '@conciv/app'
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

type MountOptions = {readonly host: HTMLElement; readonly widgetOpen: boolean; readonly router: RegisteredRouter}

function tryRequested(location: ParsedLocation | undefined): boolean {
  if (location === undefined) return false
  return rootSearchSchema.parse(location.search).try === 1
}

function followTryParam(router: RegisteredRouter): () => void {
  return router.subscribe('onResolved', ({fromLocation, toLocation}) => {
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

function insideCaptureFrame(): boolean {
  try {
    return window.frameElement?.hasAttribute('data-conciv-capture') === true
  } catch {
    return false
  }
}

function dismissWhenClosedUnconnected(router: RegisteredRouter, signal: AbortSignal): void {
  const seen = {open: false}
  window.addEventListener(
    PANEL_TOGGLED_EVENT,
    (event) => {
      const detail = event.detail
      if (!detail) return
      if (detail.open) {
        seen.open = true
        return
      }
      clearTryParam(router)
      if (shouldDismissOnClose({hasBeenOpen: seen.open, connected: detail.connected})) void dismissTry().catch(() => {})
    },
    {signal},
  )
}

async function startWidget(options: MountOptions, signal: AbortSignal): Promise<ConcivHandle | undefined> {
  if (insideCaptureFrame()) return undefined
  const tryParam = tryRequested(options.router.state.location)
  const {token, dismissed} = await getTrySession()
  const defaultOpen =
    shouldAutoOpen({widgetOpen: options.widgetOpen, tryParam, dismissed, widgetPresent: false}) || tryParam
  const [embed, tryIt, host] = await Promise.all([
    import('@conciv/app'),
    import('@conciv/plugin-try-it'),
    import('@conciv/frontend-plugin-api/host'),
  ])
  if (signal.aborted) return undefined
  const setup = tryIt.default.setup
  if (setup === undefined) throw new Error('conciv try-it plugin has no setup')
  const plugins = host
    .compose({
      'try-it': {...tryIt.default, windowEntry: async () => ({default: setup})},
    })
    .map((entry): PluginEntry => [entry, {token}])
  const conciv = embed.createConciv({plugins, settings: {defaultOpen}})
  dismissWhenClosedUnconnected(options.router, signal)
  await conciv.mount(options.host)
  return conciv
}

export function mountLiveWidget(options: MountOptions): () => void {
  const lifetime = new AbortController()
  const unsubscribe = followTryParam(options.router)
  const started = startWidget(options, lifetime.signal).catch((error: unknown) => {
    console.error('conciv live widget mount failed', error)
    return undefined
  })
  return () => {
    lifetime.abort()
    unsubscribe()
    void started.then((conciv) => conciv?.unmount())
  }
}
