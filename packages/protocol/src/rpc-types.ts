export const WS_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
export const WS_PAYLOAD_MARGIN_BYTES = 512 * 1024
export const WS_RPC_PAYLOAD_BUDGET_BYTES = WS_MAX_PAYLOAD_BYTES - WS_PAYLOAD_MARGIN_BYTES

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
