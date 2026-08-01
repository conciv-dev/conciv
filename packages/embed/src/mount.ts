import type {AnyExtension} from '@conciv/extension'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'

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

function dispatch(name: string, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, {detail}))
}

export function createConciv(init: ConcivInit = {}): ConcivHandle {
  let state: MountState = 'unmounted'
  let abort: AbortController | undefined
  let teardown: (() => void) | undefined
  let rebindImpl: ((apiBase: string) => Promise<void>) | undefined

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
    dispatch('conciv:open-panel')
  }

  function close(): void {
    dispatch('conciv:close-panel')
  }

  function toggle(): void {
    dispatch('conciv:toggle-panel')
  }

  async function rebind(apiBase: string): Promise<void> {
    if (state !== 'mounted') return
    await rebindImpl?.(apiBase)
  }

  return {mount, unmount, open, close, toggle, rebind}
}

export function mountConciv(extensions: AnyExtension[]): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('[data-conciv-script-root]')) return
  const el = document.createElement('div')
  el.setAttribute('data-conciv-script-root', '')
  document.body.appendChild(el)
  void createConciv({extensions})
    .mount(el)
    .catch(() => undefined)
}
