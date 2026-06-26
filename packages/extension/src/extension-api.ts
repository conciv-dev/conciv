import type {ClientApi, ExtensionHostContext, ExtensionSlot} from './types.js'
import {useExtensionRuntimeContext} from './runtime-context.js'

let installed: ClientApi | undefined

// The widget installs the one ClientApi at mount, before running extension client factories. Read by
// useClientApi() — a singleton accessor, not Solid context, so it resolves at mount (where a built-in's
// .client() runs, outside any render tree) as well as inside Components.
export function installClientApi(api: ClientApi): void {
  installed = api
}

export function useClientApi(): ClientApi {
  if (!installed)
    throw new Error(
      '@mandarax/extension: ClientApi not installed yet — the widget installs it at mount before running client factories',
    )
  return installed
}

// Type-level registry. Extensions augment this with their own id key; module augmentation specializes
// getExtensionApi(id) with no runtime list anywhere — the TanStack Router getRouteApi pattern.
export interface Register {}

export type ExtensionId = keyof Register extends never ? string : keyof Register & string

type ContextOf<Id> = Id extends keyof Register
  ? Register[Id] extends {context: infer Context extends object}
    ? Context
    : object
  : object

export type ExtensionApi<Context extends object = object> = {
  useClientApi: () => ClientApi
  useSlot: () => () => ExtensionSlot
  useContext: {
    (): ExtensionHostContext & Context
    <Selected>(select: (context: ExtensionHostContext & Context) => Selected): Selected
  }
}

function useSlot(): () => ExtensionSlot {
  const context = useExtensionRuntimeContext()
  return () => context.currentSlot
}

function useContextHook<Selected>(
  select?: (context: ExtensionHostContext) => Selected,
): ExtensionHostContext | Selected {
  const context = useExtensionRuntimeContext()
  return select ? select(context) : context
}

// Name-keyed accessor for files that can't import the extension (circular deps). Fully typed by the
// Register augmentation for `id`; the runtime hooks read the same singleton + runtime context the
// builder's hooks do — the id is type-level only, so there is no lookup and no list.
export function getExtensionApi<Id extends ExtensionId>(id: Id): ExtensionApi<ContextOf<Id>> {
  void id
  return {useClientApi, useSlot, useContext: useContextHook} as ExtensionApi<ContextOf<Id>>
}
