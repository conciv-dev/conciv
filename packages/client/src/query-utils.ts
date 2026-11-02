import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {contract, type RpcClient} from '@conciv/contract'

export function makeQueryUtils(client: RpcClient) {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>

export type HubCall = (name: string, input: unknown) => Promise<unknown>

function hubGroup<Group extends object>(group: Group, groupName: string, hub: HubCall): Group {
  const procedures: unknown = Reflect.get(contract, groupName)
  return new Proxy(group, {
    get(target, key) {
      const source: object = target
      if (
        typeof key !== 'string' ||
        typeof procedures !== 'object' ||
        procedures === null ||
        !Object.hasOwn(procedures, key)
      )
        return Reflect.get(source, key)
      return (input?: unknown) => hub(`conciv:${groupName}:${key}`, input ?? {})
    },
  })
}

export function hubRoutedRpc(rpc: RpcClient, hub: HubCall, groups: ReadonlySet<string>): RpcClient {
  return new Proxy(rpc, {
    get(target, key) {
      const source: object = target
      const group = Reflect.get(source, key)
      if (typeof key !== 'string' || !groups.has(key)) return group
      return hubGroup(group, key, hub)
    },
  })
}
