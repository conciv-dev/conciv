import {For, createSignal, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {runWithClientApi, type AnyExtension} from '@conciv/extension'
import type {LayerStack} from './dialogs.js'
import {makeAppClientApi} from '../extension/client-api.js'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import styles from '../styles.css?inline'

export type EffectsSurface = {
  View: () => JSX.Element
  instances: Accessor<ExtensionInstance[]>
  elementAt: (x: number, y: number) => Element | null
}

type SurfaceDeps = {
  extensions: AnyExtension[]
  apiBase: string
  layers: LayerStack
  activeSession: () => string | null
}

function decorateHost(element: HTMLDivElement): void {
  element.setAttribute('data-conciv-effects', '')
  element.style.position = 'fixed'
  element.style.zIndex = '2147483000'
}

function pageElementAt(x: number, y: number): Element | null {
  return document.elementsFromPoint(x, y).find((element) => !element.closest('[data-conciv-effects]')) ?? null
}

export function createEffectsSurface(deps: SurfaceDeps): EffectsSurface {
  const [instances, setInstances] = createSignal<ExtensionInstance[]>([])

  const connect = (extension: AnyExtension, slot: HTMLElement): void => {
    const api = makeAppClientApi({
      apiBase: deps.apiBase,
      layers: deps.layers,
      activeSession: deps.activeSession,
      surface: () => slot,
      elementAt: pageElementAt,
    })
    const result = runWithClientApi(api, () => extension.__client?.())
    const instance: ExtensionInstance = {extension, clientValue: result?.value ?? {}}
    setInstances((current) => [...current, instance])
    onCleanup(() => {
      setInstances((current) => current.filter((entry) => entry !== instance))
      result?.dispose?.()
    })
  }

  const View = (): JSX.Element => (
    <Portal mount={document.body} useShadow ref={decorateHost}>
      <style>{styles}</style>
      <For each={deps.extensions}>
        {(extension) => <div data-effect-layer ref={(slot) => onMount(() => connect(extension, slot))} />}
      </For>
    </Portal>
  )

  return {View, instances, elementAt: pageElementAt}
}
