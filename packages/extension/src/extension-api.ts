import type {ClientApi, ExtensionHostContext, ExtensionSlot} from './types.js'
import {useExtensionRuntimeContext} from './runtime-context.js'

let installed: ClientApi | undefined

export function installClientApi(api: ClientApi): void {
  installed = api
}

export function useClientApi(): ClientApi {
  if (!installed)
    throw new Error(
      '@conciv/extension: ClientApi not installed yet — the widget installs it at mount before running client factories',
    )
  return installed
}

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

export function getExtensionApi<Id extends ExtensionId>(id: Id): ExtensionApi<ContextOf<Id>> {
  void id
  return {useClientApi, useSlot, useContext: useContextHook} as ExtensionApi<ContextOf<Id>>
}
