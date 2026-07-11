import type {JSX} from 'solid-js'
import {HostApiProvider} from './hooks.js'
import type {AnyExtension} from './define-extension.js'
import type {ExtensionSlot, ExtensionView} from './types.js'

export type MountedExtensionProps = {
  extension: AnyExtension
  clientValue: object
  slot: ExtensionSlot
}

export function MountedExtension(props: MountedExtensionProps): JSX.Element {
  const Component = props.extension.Component
  if (!Component) return null
  return (
    <HostApiProvider slot={props.slot} value={props.clientValue}>
      <Component />
    </HostApiProvider>
  )
}

export type MountedSurfaceProps = {
  extension: AnyExtension
  clientValue: object
}

export function MountedSurface(props: MountedSurfaceProps): JSX.Element {
  const Surface = props.extension.Surface
  if (!Surface) return null
  return (
    <HostApiProvider slot="surface" value={props.clientValue}>
      <Surface />
    </HostApiProvider>
  )
}

export type MountedViewProps = {
  view: ExtensionView
  clientValue: object
}

export function MountedView(props: MountedViewProps): JSX.Element {
  const View = props.view.Component
  return (
    <HostApiProvider slot="widget" value={props.clientValue}>
      <View />
    </HostApiProvider>
  )
}
