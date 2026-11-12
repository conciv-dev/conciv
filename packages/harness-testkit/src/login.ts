import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '@conciv/contract'
import {concivStateDir} from '@conciv/protocol/state-types'
import {until} from './until.js'

const RecordedEngineSchema = z.object({port: z.number().int().min(1).max(65535), token: z.string().min(1)})

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

async function issuedCode(engineBase: string): Promise<string> {
  return (await makeRpcClient(engineBase).auth.issueCode()).code
}

export async function magicLink(engineBase: string, pageUrl: string): Promise<string> {
  return `${pageUrl}#conciv_otp=${await issuedCode(engineBase)}`
}

export async function trustedBrowserToken(engineBase: string): Promise<string> {
  return exchangePrintedCode(new URL(engineBase).origin, await issuedCode(engineBase))
}

export function recordedEngineBase(projectDir: string, servedOrigin?: string): string {
  const stateFile = join(concivStateDir(projectDir), 'server.json')
  const recorded = RecordedEngineSchema.parse(JSON.parse(readFileSync(stateFile, 'utf8')))
  if (servedOrigin !== undefined) refuseOtherEngine(stateFile, recorded.port, servedOrigin)
  return `http://127.0.0.1:${recorded.port}/t/${recorded.token}`
}

function refuseOtherEngine(stateFile: string, recordedPort: number, servedOrigin: string): void {
  const servedPort = Number(new URL(servedOrigin).port)
  if (servedPort === recordedPort) return
  throw new Error(
    `the page talks to the conciv engine on port ${servedPort}, but ${stateFile} records port ${recordedPort}; a stale server.json or another dev server is answering, so a login code from it would never unlock this page`,
  )
}
