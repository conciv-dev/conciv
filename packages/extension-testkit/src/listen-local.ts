import type {Server} from 'node:http'

export async function listenLocal(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}
