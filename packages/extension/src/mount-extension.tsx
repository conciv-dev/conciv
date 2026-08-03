import {Show, untrack, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {HostApiProvider} from './hooks.js'
import type {AnyExtension} from './define-extension.js'
import type {ExtensionSlot, ExtensionView} from './types.js'

export type MountedExtensionProps = {
  extension: AnyExtension
  clientValue: object
  slot: ExtensionSlot
}

export function MountedExtension(props: MountedExtensionProps): JSX.Element {
  return (
    <Show when={props.extension.Component}>
      {(Component) => (
        <HostApiProvider slot={props.slot} value={props.clientValue}>
          <Dynamic component={Component()} />
        </HostApiProvider>
      )}
    </Show>
  )
}

export type MountedSurfaceProps = {
  extension: AnyExtension
  clientValue: object
}

export function MountedSurface(props: MountedSurfaceProps): JSX.Element {
  return (
    <Show when={props.extension.Surface}>
      {(Surface) => (
        <HostApiProvider slot="surface" value={props.clientValue}>
          <Dynamic component={Surface()} />
        </HostApiProvider>
      )}
    </Show>
  )
}

export type MountedViewProps = {
  view: ExtensionView
  clientValue: object
}

export function MountedView(props: MountedViewProps): JSX.Element {
  return (
    <HostApiProvider slot="widget" value={untrack(() => props.clientValue)}>
      <Dynamic component={props.view.Component} />
    </HostApiProvider>
  )
}
