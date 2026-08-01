import {For, Show, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {MountedSurface} from '@conciv/extension/client'
import {useConnectionGeneration} from '../app/context.js'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import styles from '../styles.css?inline'

function decorateHost(element: HTMLDivElement): void {
  element.setAttribute('data-conciv-effects', '')
  element.style.position = 'fixed'
  element.style.zIndex = '2147483000'
}

export function EffectsSurface(props: {instances: ExtensionInstance[]}): JSX.Element {
  let host: HTMLDivElement | undefined
  const generation = useConnectionGeneration()
  const mountKey = () => ({instances: props.instances, generation: generation()})
  return (
    <Portal
      mount={document.body}
      useShadow
      ref={(element: HTMLDivElement) => {
        host = element
        decorateHost(element)
      }}
    >
      <style>{styles}</style>
      <EnvironmentProvider value={() => host?.shadowRoot ?? document}>
        <Show when={mountKey()} keyed>
          {(mount) => (
            <For each={mount.instances}>
              {(instance) => <MountedSurface extension={instance.extension} clientValue={instance.clientValue} />}
            </For>
          )}
        </Show>
      </EnvironmentProvider>
    </Portal>
  )
}
