import type {AnyExtension} from '@conciv/extension'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'

export type {ConcivSettingsInit} from '@conciv/protocol/config-types'

export type ExtensionsInput = AnyExtension[] | (() => Promise<AnyExtension[]>)

export type ConcivInit = {
  extensions?: ExtensionsInput
  settings?: ConcivSettingsInit
  apiBase?: string
}

export type ConcivHandle = {
  mount: (el: HTMLElement) => Promise<void>
  unmount: () => void
}

type MountState = 'unmounted' | 'mounting' | 'mounted'

export function createConciv(init: ConcivInit = {}): ConcivHandle {
  let state: MountState = 'unmounted'
  let abort: AbortController | undefined
  let teardown: (() => void) | undefined

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
      state = 'mounted'
      await impl.ready
    } catch (error) {
      if (controller.signal.aborted) return
      teardown?.()
      teardown = undefined
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
    state = 'unmounted'
  }

  return {mount, unmount}
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
