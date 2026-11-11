import {makeBrowserRpcClient, type RpcClient} from '@conciv/contract'
import {until} from './until.js'

const PRINTED_CODE = /#conciv_otp=(\d{6})/g

export type TerminalReader = () => string | Promise<string>

function printedCodes(text: string): string[] {
  return [...text.matchAll(PRINTED_CODE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

async function withBrowserRpc<Result>(origin: string, use: (rpc: RpcClient) => Promise<Result>): Promise<Result> {
  const browser = makeBrowserRpcClient(origin)
  try {
    return await use(browser.rpc)
  } finally {
    browser.close()
  }
}

export async function requestPrintedCode(origin: string, terminal: TerminalReader): Promise<string> {
  const seen = printedCodes(await terminal()).length
  await withBrowserRpc(origin, (rpc) => rpc.auth.requestCode({reissue: true}))
  const found: {code: string | undefined} = {code: undefined}
  await until(async () => {
    const codes = printedCodes(await terminal())
    found.code = codes.length > seen ? codes.at(-1) : undefined
    return found.code !== undefined
  })
  if (found.code === undefined) throw new Error('the engine printed no login code')
  return found.code
}

export async function exchangePrintedCode(origin: string, code: string): Promise<string> {
  const result = await withBrowserRpc(origin, (rpc) => rpc.auth.exchange({code}))
  if (!('token' in result)) throw new Error(`the engine refused the printed login code: ${result.refused}`)
  return result.token
}

export async function loginThroughTerminal(origin: string, terminal: TerminalReader): Promise<string> {
  return exchangePrintedCode(origin, await requestPrintedCode(origin, terminal))
}

export async function magicLink(origin: string, terminal: TerminalReader, pageUrl: string): Promise<string> {
  return `${pageUrl}#conciv_otp=${await requestPrintedCode(origin, terminal)}`
}
