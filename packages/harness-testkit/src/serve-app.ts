import {serveHono} from '@conciv/serve'

export type ServedApp = {
  base: string
  wsBase: string
  close: () => Promise<void>
}

export async function serveApp(fetch: (request: Request) => Response | Promise<Response>): Promise<ServedApp> {
  const {port, close} = await serveHono({fetch})
  const base = `http://127.0.0.1:${port}`
  return {base, wsBase: base.replace('http', 'ws'), close}
}
