import {makeRpcClient} from '@conciv/contract'
import {until} from './until.js'

const PRINTED_CODE = /#conciv_otp=(\d{6})/g

export type TerminalReader = () => string | Promise<string>

function printedCodes(text: string): string[] {
  return [...text.matchAll(PRINTED_CODE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

export async function requestPrintedCode(origin: string, terminal: TerminalReader): Promise<string> {
  const seen = printedCodes(await terminal()).length
  await makeRpcClient(origin).auth.requestCode({reissue: true})
  const found: {code: string | undefined} = {code: undefined}
  await until(async () => {
    found.code = printedCodes(await terminal())[seen]
    return found.code !== undefined
  })
  if (found.code === undefined) throw new Error('the engine printed no login code')
  return found.code
}

export async function exchangePrintedCode(origin: string, code: string): Promise<string> {
  const result = await makeRpcClient(origin).auth.exchange({code})
  if (!('token' in result)) throw new Error(`the engine refused the printed login code: ${result.refused}`)
  return result.token
}

export async function loginThroughTerminal(origin: string, terminal: TerminalReader): Promise<string> {
  return exchangePrintedCode(origin, await requestPrintedCode(origin, terminal))
}
