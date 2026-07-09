import {createComponent, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {installClientApi} from './extension-api.js'
import {ExtensionRuntimeContext} from './runtime-context.js'
import {HostProvider} from './host.js'
import type {HostApi} from './host-types.js'
import type {AnyExtension} from './define-extension.js'
import type {ClientApi, ExtensionHostContext, ExtensionSlot, ExtensionView} from './types.js'

export type MountedExtensionProps = {
  extension: AnyExtension
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  clientValue: object
  slot: ExtensionSlot
}

export function MountedExtension(props: MountedExtensionProps): JSX.Element {
  const component = props.extension.Component
  if (!component) return null
  return createComponent(ExtensionRuntimeContext.Provider, {
    get value() {
      return {...props.hostContext, ...props.clientValue, currentSlot: props.slot}
    },
    get children() {
      return createComponent(component, {})
    },
  })
}

export type MountedViewProps = {
  view: ExtensionView
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  clientValue: object
}

export function MountedView(props: MountedViewProps): JSX.Element {
  return createComponent(ExtensionRuntimeContext.Provider, {
    get value() {
      return {...props.hostContext, ...props.clientValue, currentSlot: 'widget' as const}
    },
    get children() {
      return createComponent(props.view.Component, {})
    },
  })
}

export type MountExtensionOptions = {
  clientApi: ClientApi
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  slot: ExtensionSlot
  root: HTMLElement
  host?: HostApi
}

export function mountExtension(extension: AnyExtension, options: MountExtensionOptions): () => void {
  installClientApi(options.clientApi)
  const client = extension.__client?.()
  const clientValue = client?.value ?? {}
  const mounted = () =>
    createComponent(MountedExtension, {
      extension,
      hostContext: options.hostContext,
      clientValue,
      slot: options.slot,
    })
  const disposeRender = render(() => {
    const host = options.host
    return host
      ? createComponent(HostProvider, {
          host,
          slot: options.slot,
          get children() {
            return mounted()
          },
        })
      : mounted()
  }, options.root)
  return () => {
    disposeRender()
    client?.dispose?.()
  }
}
