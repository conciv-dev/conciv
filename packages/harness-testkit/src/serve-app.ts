import {serveHono, type ClaimUpgrade} from '@conciv/serve'

export type ServedApp = {
  base: string
  wsBase: string
  port: number
  close: () => Promise<void>
}

export async function serveApp(
  listener: {fetch: (request: Request) => Response | Promise<Response>; claimUpgrade?: ClaimUpgrade},
  opts: {port?: number} = {},
): Promise<ServedApp> {
  const {port, close} = await serveHono({...listener, port: opts.port})
  const base = `http://127.0.0.1:${port}`
  return {base, wsBase: base.replace('http', 'ws'), port, close}
}
