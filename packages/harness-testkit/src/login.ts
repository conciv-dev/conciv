import {z} from 'zod'
import {until} from './until.js'

const PRINTED_CODE = /#conciv_otp=(\d{6})/g
const TokenSchema = z.object({token: z.string().min(1)})

export type TerminalReader = () => string | Promise<string>

function printedCodes(text: string): string[] {
  return [...text.matchAll(PRINTED_CODE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

export async function requestPrintedCode(origin: string, terminal: TerminalReader): Promise<string> {
  const seen = printedCodes(await terminal()).length
  const response = await fetch(`${origin}/auth/code`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({reissue: true}),
  })
  if (!response.ok) throw new Error(`the engine refused to print a login code: HTTP ${response.status}`)
  const found: {code: string | undefined} = {code: undefined}
  await until(async () => {
    found.code = printedCodes(await terminal())[seen]
    return found.code !== undefined
  })
  if (found.code === undefined) throw new Error('the engine printed no login code')
  return found.code
}

export async function exchangePrintedCode(origin: string, code: string): Promise<string> {
  const response = await fetch(`${origin}/auth/exchange`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({code}),
  })
  const parsed = TokenSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error(`the engine refused the printed login code: HTTP ${response.status}`)
  return parsed.data.token
}

export async function loginThroughTerminal(origin: string, terminal: TerminalReader): Promise<string> {
  return exchangePrintedCode(origin, await requestPrintedCode(origin, terminal))
}
