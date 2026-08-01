import {ErrorBoundary, For, type JSX} from 'solid-js'
import {MountedExtension} from '@conciv/extension/client'
import type {AnyExtension, ExtensionSlot} from '@conciv/extension'

export type ExtensionInstance = {extension: AnyExtension; clientValue: object; dispose: () => void}

export function ExtensionSurface(props: {name: ExtensionSlot; instances: ExtensionInstance[]}): JSX.Element {
  return (
    <For each={props.instances}>
      {(instance) => (
        <ErrorBoundary fallback={null}>
          <MountedExtension extension={instance.extension} clientValue={instance.clientValue} slot={props.name} />
        </ErrorBoundary>
      )}
    </For>
  )
}
