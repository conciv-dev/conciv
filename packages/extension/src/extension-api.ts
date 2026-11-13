import type {ExtensionRegistry} from '@conciv/protocol/config-types'
import {getHostApi, useExtensionValue} from './hooks.js'

export type ExtensionId = keyof ExtensionRegistry extends never ? string : keyof ExtensionRegistry & string

type InferContext<Id> = Id extends keyof ExtensionRegistry
  ? ExtensionRegistry[Id] extends {context: infer Context extends object}
    ? Context
    : object
  : object

type ExtensionContextApi<Context extends object> = {
  useContext: {
    (): Context
    <Selected>(select: (context: Context) => Selected): Selected
  }
}

export type ExtensionApi<Context extends object = object> = ReturnType<typeof getHostApi> & ExtensionContextApi<Context>

export function getExtensionApi<Id extends ExtensionId>(id: Id): ExtensionApi<InferContext<Id>> {
  function useContextHook(): InferContext<Id>
  function useContextHook<Selected>(select: (context: InferContext<Id>) => Selected): Selected
  function useContextHook<Selected>(select?: (context: InferContext<Id>) => Selected): InferContext<Id> | Selected {
    const value = useExtensionValue(`${id}.useContext`) as InferContext<Id>
    return select ? select(value) : value
  }
  return {...getHostApi(), useContext: useContextHook} satisfies ExtensionApi<InferContext<Id>>
}
