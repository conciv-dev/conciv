import {serveHono, type ServedHono} from '@conciv/serve'

export type ServedApp = {
  base: string
  wsBase: string
  port: number
  wss: ServedHono['wss']
  close: () => Promise<void>
}

export async function serveApp(
  fetch: (request: Request) => Response | Promise<Response>,
  opts: {port?: number} = {},
): Promise<ServedApp> {
  const {port, close, wss} = await serveHono({fetch, port: opts.port})
  const base = `http://127.0.0.1:${port}`
  return {base, wsBase: base.replace('http', 'ws'), port, wss, close}
}
