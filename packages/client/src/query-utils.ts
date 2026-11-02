import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {skipToken} from '@tanstack/query-core'
import type {RpcClient} from '@conciv/contract'

export function makeQueryUtils(client: RpcClient) {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>

export type HubCall = (name: string, input: unknown) => Promise<unknown>

export type QueryGroup = keyof QueryUtils & string

function hubProcedure<Procedure extends object>(procedure: Procedure, name: string, hub: HubCall): Procedure {
  return new Proxy(procedure, {
    get(target, key) {
      const source: object = target
      const value = Reflect.get(source, key)
      if (key === 'queryOptions')
        return (options?: {input?: unknown}) => {
          if (options?.input === skipToken) return value(options)
          return {...value(options), queryFn: () => hub(name, options?.input ?? {})}
        }
      if (key === 'mutationOptions')
        return (options?: object) => ({...value(options), mutationFn: (input: unknown) => hub(name, input ?? {})})
      return value
    },
  })
}

function hubGroup<Group extends object>(group: Group, groupName: string, hub: HubCall): Group {
  return new Proxy(group, {
    get(target, key) {
      const source: object = target
      const procedure = Reflect.get(source, key)
      if (typeof key !== 'string') return procedure
      return hubProcedure(procedure, `conciv:${groupName}:${key}`, hub)
    },
  })
}

export function hubQueryUtils(utils: QueryUtils, hub: HubCall, groups: ReadonlySet<string>): QueryUtils {
  return new Proxy(utils, {
    get(target, key) {
      const source: object = target
      const group = Reflect.get(source, key)
      if (typeof key !== 'string' || !groups.has(key)) return group
      return hubGroup(group, key, hub)
    },
  })
}
