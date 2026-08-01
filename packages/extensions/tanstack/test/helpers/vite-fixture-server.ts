import {createServer, type ViteDevServer} from 'vite'

export async function startViteFixtureServer(root: string): Promise<{vite: ViteDevServer; viteBase: string}> {
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {vite, viteBase: `http://127.0.0.1:${port}`}
}
