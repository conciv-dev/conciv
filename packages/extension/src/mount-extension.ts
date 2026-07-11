import {createComponent, type JSX} from 'solid-js'
import {HostApiProvider} from './hooks.js'
import type {AnyExtension} from './define-extension.js'
import type {ExtensionSlot, ExtensionView} from './types.js'

export type MountedExtensionProps = {
  extension: AnyExtension
  clientValue: object
  slot: ExtensionSlot
}

export function MountedExtension(props: MountedExtensionProps): JSX.Element {
  const component = props.extension.Component
  if (!component) return null
  return createComponent(HostApiProvider, {
    get slot() {
      return props.slot
    },
    get value() {
      return props.clientValue
    },
    get children() {
      return createComponent(component, {})
    },
  })
}

export type MountedSurfaceProps = {
  extension: AnyExtension
  clientValue: object
}

export function MountedSurface(props: MountedSurfaceProps): JSX.Element {
  const component = props.extension.Surface
  if (!component) return null
  return createComponent(HostApiProvider, {
    slot: 'surface' as const,
    get value() {
      return props.clientValue
    },
    get children() {
      return createComponent(component, {})
    },
  })
}

export type MountedViewProps = {
  view: ExtensionView
  clientValue: object
}

export function MountedView(props: MountedViewProps): JSX.Element {
  return createComponent(HostApiProvider, {
    slot: 'widget' as const,
    get value() {
      return props.clientValue
    },
    get children() {
      return createComponent(props.view.Component, {})
    },
  })
}
