import type {AnyExtension} from '@conciv/extension'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'
import type {EventBusClient, PanelCommandEventMap} from '@conciv/protocol/event-bus'

export type {ConcivSettingsInit} from '@conciv/protocol/config-types'

export type ExtensionsInput = AnyExtension[] | (() => Promise<AnyExtension[]>)

export type ConcivInit = {
  extensions?: ExtensionsInput
  settings?: ConcivSettingsInit
  apiBase?: string
  grabProvider?: GrabProvider
}

export type ConcivHandle = {
  mount: (el: HTMLElement) => Promise<void>
  unmount: () => void
  open: () => void
  close: () => void
  toggle: () => void
  rebind: (apiBase: string) => Promise<void>
}

type MountState = 'unmounted' | 'mounting' | 'mounted'

type PanelCommandName = keyof PanelCommandEventMap & string

type PanelCommandsBus = {
  client: EventBusClient<PanelCommandEventMap>
  events: {open: PanelCommandName; close: PanelCommandName; toggle: PanelCommandName}
}

export function createConciv(init: ConcivInit = {}): ConcivHandle {
  let state: MountState = 'unmounted'
  let abort: AbortController | undefined
  let teardown: (() => void) | undefined
  let rebindImpl: ((apiBase: string) => Promise<void>) | undefined
  let panelCommandsPromise: Promise<PanelCommandsBus> | null = null

  function panelCommands(): Promise<PanelCommandsBus> {
    if (panelCommandsPromise) return panelCommandsPromise
    panelCommandsPromise = import('@conciv/protocol/event-bus').then((eventBus) => ({
      client: eventBus.createEventBusClient<PanelCommandEventMap>({
        channel: eventBus.PANEL_COMMAND_CHANNEL,
        reconnectEveryMs: 500,
        maxRetries: 60,
      }),
      events: {open: eventBus.OPEN_PANEL_EVENT, close: eventBus.CLOSE_PANEL_EVENT, toggle: eventBus.TOGGLE_PANEL_EVENT},
    }))
    return panelCommandsPromise
  }

  async function mount(el: HTMLElement): Promise<void> {
    if (typeof document === 'undefined') return
    if (state !== 'unmounted') return
    state = 'mounting'
    const controller = new AbortController()
    abort = controller
    try {
      const {mountImpl} = await import('./mount-impl.js')
      if (controller.signal.aborted) return
      const impl = mountImpl(init, el)
      teardown = impl.teardown
      rebindImpl = impl.rebind
      state = 'mounted'
      await impl.ready
    } catch (error) {
      if (controller.signal.aborted) return
      teardown?.()
      teardown = undefined
      rebindImpl = undefined
      state = 'unmounted'
      console.error('[conciv] failed to start widget', error)
      throw error
    }
  }

  function unmount(): void {
    if (state === 'unmounted') return
    abort?.abort()
    teardown?.()
    teardown = undefined
    rebindImpl = undefined
    state = 'unmounted'
  }

  function open(): void {
    if (typeof window === 'undefined') return
    void panelCommands().then((bus) => bus.client.emit(bus.events.open, undefined))
  }

  function close(): void {
    if (typeof window === 'undefined') return
    void panelCommands().then((bus) => bus.client.emit(bus.events.close, undefined))
  }

  function toggle(): void {
    if (typeof window === 'undefined') return
    void panelCommands().then((bus) => bus.client.emit(bus.events.toggle, undefined))
  }

  async function rebind(apiBase: string): Promise<void> {
    if (state !== 'mounted') return
    await rebindImpl?.(apiBase)
  }

  return {mount, unmount, open, close, toggle, rebind}
}

export function mountConciv(extensions: AnyExtension[]): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (document.querySelector('[data-conciv-script-root]')) return Promise.resolve()
  const el = document.createElement('div')
  el.setAttribute('data-conciv-script-root', '')
  document.body.appendChild(el)
  return createConciv({extensions}).mount(el)
}
