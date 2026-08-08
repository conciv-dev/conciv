export type RpcHeaders = Readonly<Record<string, string | string[] | undefined>>

export type RpcContext = {
  origin: string
  headers: RpcHeaders
}

export function rpcHeader(context: RpcContext, name: string): string | null {
  const value = context.headers[name]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
