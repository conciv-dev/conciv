import {createEffect, onCleanup, type JSX} from 'solid-js'
import {isServer} from 'solid-js/web'
import {createConciv, type ConcivHandle, type ConcivInit} from '@conciv/app'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/app'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): JSX.Element {
  if (isServer) return null
  const el = document.createElement('div')
  let handle: ConcivHandle | undefined
  createEffect(() => {
    const init: ConcivInit = {
      apiBase: props.apiBase,
      settings: props.settings,
      plugins: props.plugins,
      grabProvider: props.grabProvider,
      engineToken: props.engineToken,
    }
    handle?.unmount()
    handle = createConciv(init)
    void handle.mount(el).catch(() => undefined)
  })
  onCleanup(() => handle?.unmount())
  return el
}
