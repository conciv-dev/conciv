import {readFileSync, watch} from 'node:fs'
import {expect, test, type ConsoleMessage, type Page, type WebSocketRoute} from '@playwright/test'
import {ORPCError, toORPCError} from '@orpc/client'
import {StandardRPCJsonSerializer, StandardRPCSerializer, toHttpPath} from '@orpc/client/standard'
import {decodeRequestMessage, encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import {contract} from '@conciv/contract'
import {magicLink, recordedEngineBase} from './login.js'
import {e2eConfigDir, e2eServerLog} from './config.js'

export type PageFailures = {
  pageErrors: string[]
  consoleErrors: string[]
  requestFailures: string[]
  thirdPartyRequests: string[]
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const OUTDATED_OPTIMIZE_DEP = 'Outdated Optimize Dep'
const DUPLICATE_SOLID = 'You appear to have multiple instances of Solid'

function redactUrl(url: string): string {
  const parsed = URL.parse(url)
  if (parsed === null) return '<unparsable url>'
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return parsed.protocol
  return `${parsed.origin}${parsed.pathname}`
}

function describeConsoleMessage(message: ConsoleMessage): string {
  const {url} = message.location()
  return url === '' ? message.text() : `${message.text()} [${redactUrl(url)}]`
}

function isThirdPartyRequest(url: string): boolean {
  const parsed = URL.parse(url)
  if (parsed === null) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !LOOPBACK_HOSTS.includes(parsed.hostname)
}

export function collectFailures(page: Page): PageFailures {
  const failures: PageFailures = {pageErrors: [], consoleErrors: [], requestFailures: [], thirdPartyRequests: []}
  page.on('pageerror', (error) => failures.pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes(DUPLICATE_SOLID)) {
      failures.consoleErrors.push(describeConsoleMessage(message))
    }
  })
  page.on('request', (request) => {
    if (isThirdPartyRequest(request.url())) failures.thirdPartyRequests.push(redactUrl(request.url()))
  })
  page.on('requestfailed', (request) => {
    failures.requestFailures.push(`${redactUrl(request.url())}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const reason = response.statusText()
    if (response.status() === 504 && reason.includes(OUTDATED_OPTIMIZE_DEP)) return
    const described = reason === '' ? '' : ` ${reason}`
    failures.requestFailures.push(`${redactUrl(response.url())}: HTTP ${response.status()}${described}`)
  })
  return failures
}

function describeFailures(failures: PageFailures): string {
  return [
    ...failures.pageErrors.map((entry) => `pageerror: ${entry}`),
    ...failures.consoleErrors.map((entry) => `console: ${entry}`),
    ...failures.requestFailures.map((entry) => `request: ${entry}`),
    ...failures.thirdPartyRequests.map((entry) => `third-party request: ${entry}`),
  ].join('\n')
}

export async function expectWidgetBoots(page: Page, failures: PageFailures): Promise<void> {
  const launcher = page.getByRole('button', {name: /conciv chat$/})
  try {
    await expect(launcher).toBeVisible()
  } catch (error) {
    const detail = describeFailures(failures)
    throw detail === '' ? error : new Error(`widget did not boot\n${detail}`, {cause: error})
  }
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') await launcher.click()
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  const transientOptimizerReload = /Failed to fetch dynamically imported module|504 \(Outdated Optimize Dep\)/
  const detail = describeFailures(failures)
  expect(failures.thirdPartyRequests, detail).toEqual([])
  expect(
    failures.pageErrors.filter((entry) => !transientOptimizerReload.test(entry)),
    detail,
  ).toEqual([])
  expect(
    failures.consoleErrors.filter((entry) => !transientOptimizerReload.test(entry)),
    detail,
  ).toEqual([])
}

const RPC_SOCKET_PATH = '/rpc-ws'

export async function refuseEngineSocket(page: Page): Promise<{arrived: Promise<void>; release: () => void}> {
  const arrived = Promise.withResolvers<void>()
  let released = false
  await page.routeWebSocket(
    (url) => url.pathname === RPC_SOCKET_PATH,
    async (socket) => {
      arrived.resolve()
      if (released) {
        socket.connectToServer()
        return
      }
      await socket.close()
    },
  )
  return {
    arrived: arrived.promise,
    release: () => {
      released = true
    },
  }
}

type EnginePath<Router = typeof contract> = {
  [Key in keyof Router & string]: Router[Key] extends {'~orpc': unknown} ? [Key] : [Key, ...EnginePath<Router[Key]>]
}[keyof Router & string]

type EngineProcedure<Path, Router = typeof contract> = Path extends [infer Head extends keyof Router, ...infer Rest]
  ? Rest extends []
    ? Router[Head]
    : EngineProcedure<Rest, Router[Head]>
  : never

type EngineErrorCode<Path> =
  | (EngineProcedure<Path> extends {'~orpc': {errorMap: infer Errors}} ? keyof Errors & string : never)
  | 'INTERNAL_SERVER_ERROR'

function readField(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined
}

async function engineErrorFrame(path: readonly string[], id: string, code: string): Promise<string | Buffer> {
  const procedure = path.reduce<unknown>(readField, contract)
  const entry = readField(readField(readField(procedure, '~orpc'), 'errorMap'), code)
  const message = readField(entry, 'message')
  const status = readField(entry, 'status')
  const error =
    entry === undefined
      ? toORPCError(new Error(code))
      : new ORPCError(code, {
          defined: true,
          message: typeof message === 'string' ? message : undefined,
          status: typeof status === 'number' ? status : undefined,
        })
  const body = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize(error.toJSON())
  const encoded = await encodeResponseMessage(id, MessageType.RESPONSE, {status: error.status, headers: {}, body})
  if (typeof encoded === 'string') return encoded
  return Buffer.from(encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded))
}

type EngineFrame = {
  socket: WebSocketRoute
  id: string
  type: MessageType
  call: boolean
  forward: () => void
  fail: (code: string) => Promise<void>
}

async function routeEngineFrames(
  page: Page,
  path: readonly string[],
  route: (frame: EngineFrame) => void | Promise<void>,
): Promise<void> {
  const pathname = toHttpPath(path)
  await page.routeWebSocket(
    (url) => url.pathname === RPC_SOCKET_PATH,
    (socket) => {
      const server = socket.connectToServer()
      let decoding = Promise.resolve()
      const decode = async (frame: string | Buffer): Promise<void> => {
        const decoded = await decodeRequestMessage(frame).catch(() => undefined)
        if (decoded === undefined) return server.send(frame)
        const [id, type, payload] = decoded
        await route({
          socket,
          id,
          type,
          call: type === MessageType.REQUEST && payload.url.pathname === pathname,
          forward: () => server.send(frame),
          fail: async (code) => socket.send(await engineErrorFrame(path, id, code)),
        })
      }
      socket.onMessage((frame) => {
        decoding = decoding.then(() => decode(frame))
      })
    },
  )
}

export async function holdEngineCall<Path extends EnginePath>(
  page: Page,
  path: Path,
  {
    when = (count) => count === 1,
    fail,
    armed = true,
  }: {when?: (count: number) => boolean; fail?: EngineErrorCode<Path>; armed?: boolean} = {},
): Promise<{arrived: Promise<void>; arm: () => void; release: (failWith?: EngineErrorCode<Path>) => void}> {
  const arrived = Promise.withResolvers<void>()
  const released = Promise.withResolvers<string | undefined>()
  let phase: 'unarmed' | 'armed' | 'released' = armed ? 'armed' : 'unarmed'
  let calls = 0
  const taken: {socket: WebSocketRoute; id: string}[] = []
  await routeEngineFrames(page, path, (frame) => {
    const isTaken = taken.some((call) => call.socket === frame.socket && call.id === frame.id)
    if (!isTaken) {
      if (phase !== 'armed' || !frame.call) return frame.forward()
      calls += 1
      if (!when(calls)) return frame.forward()
      taken.push({socket: frame.socket, id: frame.id})
      arrived.resolve()
      if (fail !== undefined) return frame.fail(fail)
    }
    if (fail !== undefined) return
    void released.promise.then(async (code) => {
      if (code === undefined) return frame.forward()
      if (frame.type === MessageType.REQUEST) await frame.fail(code)
    })
  })
  return {
    arrived: arrived.promise,
    arm: () => {
      if (phase === 'unarmed') phase = 'armed'
    },
    release: (failWith) => {
      phase = 'released'
      released.resolve(failWith)
    },
  }
}

async function engineOrigin(page: Page, path: string): Promise<string> {
  const rpcSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === RPC_SOCKET_PATH)
  await page.goto(path, {waitUntil: 'domcontentloaded', timeout: 60_000})
  const url = new URL((await rpcSocket).url())
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  return url.origin
}

async function pageEngine(page: Page, path: string, projectDir: string): Promise<{origin: string; base: string}> {
  const origin = await engineOrigin(page, path)
  return {origin, base: recordedEngineBase(projectDir, origin)}
}

function testProjectDir(): string {
  const projectDir: unknown = test.info().project.metadata['projectDir']
  return typeof projectDir === 'string' ? projectDir : process.cwd()
}

export async function loginWidget(page: Page, path = '/', projectDir = testProjectDir()): Promise<void> {
  const {base} = await pageEngine(page, path, projectDir)
  const link = await magicLink(base, page.url())
  await page.goto('about:blank')
  await page.goto(link, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await expect(page.getByRole('button', {name: /conciv chat$/})).toBeVisible()
}

const PRINTED_CODE = /#conciv_otp=(\d{6})/g

function printedCodes(logPath: string): string[] {
  return [...readFileSync(logPath, 'utf8').matchAll(PRINTED_CODE)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
}

function nextPrintedCode(logPath: string): Promise<string> {
  const seen = printedCodes(logPath).length
  const {promise, resolve, reject} = Promise.withResolvers<string>()
  const watcher = watch(logPath, {persistent: false}, () => {
    const code = printedCodes(logPath)[seen]
    if (code === undefined) return
    watcher.close()
    resolve(code)
  })
  watcher.on('error', reject)
  return promise
}

export async function openLoginFromLockedLauncher(page: Page, path = '/'): Promise<string> {
  await engineOrigin(page, path)
  const logPath = e2eServerLog(e2eConfigDir(test.info().config.configFile), Number(new URL(page.url()).port))
  const printed = nextPrintedCode(logPath)
  await page.getByRole('button', {name: 'Unauthorized. Authorize conciv'}).click()
  await expect(page.getByRole('dialog', {name: 'Authorize conciv'})).toBeVisible()
  return printed
}
