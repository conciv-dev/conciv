import {ErrorBoundary, For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ExtensionRuntimeContext} from '@mandarax/extension/runtime'
import type {ExtensionBuilder, ExtensionHostContext, ExtensionSlot} from '@mandarax/extension'

export type ExtensionHostBag = Omit<ExtensionHostContext, 'currentSlot'>

export type ExtensionInstance = {extension: ExtensionBuilder<object>; clientValue: object}

export function ExtensionSurface(props: {
  name: ExtensionSlot
  instances: ExtensionInstance[]
  bag: ExtensionHostBag
}): JSX.Element {
  return (
    <For each={props.instances}>
      {(instance) => (
        <Show when={instance.extension.Component}>
          {(component) => (
            <ErrorBoundary fallback={null}>
              <ExtensionRuntimeContext.Provider
                value={{...props.bag, ...instance.clientValue, currentSlot: props.name}}
              >
                <Dynamic component={component()} />
              </ExtensionRuntimeContext.Provider>
            </ErrorBoundary>
          )}
        </Show>
      )}
    </For>
  )
}
