import {For, type JSX} from 'solid-js'
import {MountedExtension} from '@conciv/extension/client'
import type {AnyExtension, ClientEffect, ExtensionSlot} from '@conciv/extension'
import {ExtensionBoundary} from './extension-boundary.js'

export type ExtensionInstance = {
  extension: AnyExtension
  clientValue: object
  effects: readonly ClientEffect[]
  dispose: () => void
}

export function ExtensionSurface(props: {name: ExtensionSlot; instances: ExtensionInstance[]}): JSX.Element {
  return (
    <For each={props.instances}>
      {(instance) => (
        <ExtensionBoundary name={instance.extension.name} fallback="silent">
          <MountedExtension extension={instance.extension} clientValue={instance.clientValue} slot={props.name} />
        </ExtensionBoundary>
      )}
    </For>
  )
}
