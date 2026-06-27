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

export type MountExtensionOptions = MountedExtensionProps & {
  clientApi: ClientApi
  root: HTMLElement
}

export function mountExtension(options: MountExtensionOptions): () => void {
  installClientApi(options.clientApi)
  return render(
    () =>
      createComponent(MountedExtension, {
        extension: options.extension,
        hostContext: options.hostContext,
        clientValue: options.clientValue,
        slot: options.slot,
      }),
    options.root,
  )
}
