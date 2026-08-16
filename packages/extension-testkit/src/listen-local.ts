import type {Server} from 'node:http'

export async function listenLocal(
  server: Server,
  port = 0,
): Promise<{base: string; port: number; close: () => Promise<void>}> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolve()
    })
  })
  const address = server.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
