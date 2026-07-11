import {ErrorBoundary, For, type JSX} from 'solid-js'
import {MountedExtension} from '@conciv/extension/client'
import type {AnyExtension, ExtensionHostContext, ExtensionSlot} from '@conciv/extension'

export type ExtensionHostBag = Omit<ExtensionHostContext, 'currentSlot'>

export type ExtensionInstance = {extension: AnyExtension; clientValue: object; dispose?: () => void}

export function ExtensionSurface(props: {
  name: ExtensionSlot
  instances: ExtensionInstance[]
  bag: ExtensionHostBag
}): JSX.Element {
  return (
    <For each={props.instances}>
      {(instance) => (
        <ErrorBoundary fallback={null}>
          <MountedExtension
            extension={instance.extension}
            hostContext={props.bag}
            clientValue={instance.clientValue}
            slot={props.name}
          />
        </ErrorBoundary>
      )}
    </For>
  )
}
