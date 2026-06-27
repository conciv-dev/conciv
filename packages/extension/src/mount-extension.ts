import {type Accessor, type Component, createComponent, type JSX, Show} from 'solid-js'
import {Dynamic, render} from 'solid-js/web'
import {installClientApi} from './extension-api.js'
import {ExtensionRuntimeContext} from './runtime-context.js'
import type {AnyExtension} from './define-extension.js'
import type {ClientApi, ExtensionHostContext, ExtensionSlot} from './types.js'

export type MountedExtensionProps = {
  extension: AnyExtension
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  clientValue: object
  slot: ExtensionSlot
}

export function MountedExtension(props: MountedExtensionProps): JSX.Element {
  return createComponent(Show, {
    get when() {
      return props.extension.Component
    },
    children: (component: Accessor<Component>) =>
      createComponent(ExtensionRuntimeContext.Provider, {
        get value() {
          return {...props.hostContext, ...props.clientValue, currentSlot: props.slot}
        },
        get children() {
          return createComponent(Dynamic, {
            get component() {
              return component()
            },
          })
        },
      }),
  })
}

export type MountExtensionOptions = {
  clientApi: ClientApi
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  slot: ExtensionSlot
  root: HTMLElement
}

export function mountExtension(extension: AnyExtension, options: MountExtensionOptions): () => void {
  installClientApi(options.clientApi)
  const client = extension.__client?.()
  const clientValue = client?.value ?? {}
  const disposeRender = render(
    () =>
      createComponent(MountedExtension, {extension, hostContext: options.hostContext, clientValue, slot: options.slot}),
    options.root,
  )
  return () => {
    disposeRender()
    client?.dispose?.()
  }
}
