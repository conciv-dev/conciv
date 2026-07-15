import {ORPCError} from '@orpc/client'
import {makeRpcClient, type RpcClient} from '@conciv/contract'

function defaultOrigin(): string {
  const port = process.env.CONCIV_PORT ?? '5173'
  return `http://127.0.0.1:${port}`
}

export async function runRpc(call: (rpc: RpcClient) => Promise<unknown>): Promise<void> {
  try {
    const result = await call(makeRpcClient(defaultOrigin()))
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error
    process.stdout.write(JSON.stringify({message: error.message}) + '\n')
  }
}
