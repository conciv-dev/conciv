import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import react from '@vitejs/plugin-react'
import {chromium, type Browser, type Page} from 'playwright'
import {createServer, type ViteDevServer} from 'vite'
import {z} from 'zod'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, type SessionId} from '@conciv/protocol/chat-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {DESIGN_TOOL_PREFIX, DESIGN_TOOLS} from '@conciv/extension-design/defs'
import {unplugin} from '../src/plugin-instance.js'
import {renderTargets} from '../test/fixtures/design/render-targets.js'

const HOST_ROOT = fileURLToPath(new URL('../test/fixtures/design/host/', import.meta.url))
const ENDPOINT_FILE = 'dev-endpoint.json'
const TAB_HEIGHT = 720
const PAGE_DRIVER_TIMEOUT_MS = 30_000
const WIDGET_BOOT = `${react.preambleCode.replace('__BASE__', '/')}\nawait import(${JSON.stringify(EXTENSIONS_ROUTE)})`

const RUNS_COMMAND = 'design:runs'
const EndpointSchema = z.object({apiBase: z.string().min(1)})
const [getDef, watchDef, validateDef] = DESIGN_TOOLS

type Options = {
  route: string
  width: number
  image?: string
  figma?: string
  document?: string
  state?: string
  port: number
  agent: boolean
  blind: boolean
  noDesign: boolean
}

type Trial = {rpc: RpcClient; page: Page; id: string; session: SessionId}

type TrialDirs = {stateRoot: string; devEndpointDir: string; temporary: string[]}

type GetInput = z.input<typeof getDef.inputSchema>

type Command = (input: {trial: Trial; args: string[]}) => Promise<void>

const COMMANDS: Record<string, Command> = {
  get: ({trial, args: [file]}) => called({trial, name: getDef.name, schema: getDef.outputSchema, file}),
  watch: ({trial, args: [file]}) => called({trial, name: watchDef.name, schema: watchDef.outputSchema, file}),
  validate: ({trial, args: [file]}) => called({trial, name: validateDef.name, schema: validateDef.outputSchema, file}),
  run: async ({trial, args}) => print(JSON.stringify(await trial.rpc.extensions.run({name: RUNS_COMMAND, args}))),
  screenshot: async ({trial, args: [file = 'trial.png']}) => {
    await trial.page.screenshot({path: resolve(file), fullPage: true})
    print(`wrote ${resolve(file)}`)
  },
}

await main()

async function main(): Promise<void> {
  process.env.LAUNCH_EDITOR = 'true'
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      route: {type: 'string', default: '/'},
      width: {type: 'string', default: '1280'},
      image: {type: 'string'},
      figma: {type: 'string'},
      document: {type: 'string'},
      state: {type: 'string'},
      port: {type: 'string', default: '0'},
      render: {type: 'string'},
      agent: {type: 'boolean', default: false},
      blind: {type: 'boolean', default: false},
      'no-design': {type: 'boolean', default: false},
    },
  })
  if (values.render !== undefined) return render(resolve(values.render))
  const options = {...values, noDesign: values['no-design'], width: Number(values.width), port: Number(values.port)}
  return serve({options, commands: positionals})
}

async function render(dir: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    await renderTargets({browser, dir})
    print(`rendered the design targets into ${dir}`)
  } finally {
    await browser.close()
  }
}

async function serve(input: {options: Options; commands: string[]}): Promise<void> {
  const {options} = input
  const target = await targetInput(options)
  const dirs = await trialDirs(options.state)
  const server = await hostServer({...dirs, ...options})
  const browser = await chromium.launch({args: ['--disable-features=LocalNetworkAccessChecks']})
  try {
    const trial = await open({options, server, browser, devEndpointDir: dirs.devEndpointDir, target})
    print(`state ${dirs.stateRoot}`)
    await readCommands({trial, commands: input.commands})
  } finally {
    await browser.close()
    await server.close()
    await Promise.all(dirs.temporary.map((dir) => rm(dir, {recursive: true, force: true})))
  }
}

async function targetInput(options: Options): Promise<GetInput> {
  const {image, figma, document} = options
  if (document !== undefined) {
    if (figma === undefined || image === undefined) throw new Error('--document needs --figma and --image')
    const parsed: unknown = JSON.parse(await readFile(resolve(document), 'utf8'))
    return {figma, image: resolve(image), document: parsed}
  }
  if (image !== undefined && figma === undefined) return {image: resolve(image)}
  if (figma !== undefined && image === undefined) return {figma}
  throw new Error('--image <png> or --figma <link> is required')
}

async function trialDirs(state: string | undefined): Promise<TrialDirs> {
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-trial-endpoint-'))
  if (state !== undefined) return {stateRoot: state, devEndpointDir, temporary: [devEndpointDir]}
  const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-trial-state-'))
  return {stateRoot, devEndpointDir, temporary: [devEndpointDir, stateRoot]}
}

async function readCommands(input: {trial: Trial; commands: string[]}): Promise<void> {
  const lines = input.commands.length > 0 ? input.commands : createInterface({input: process.stdin})
  for await (const line of lines) {
    const [name = '', ...args] = line.trim().split(' ').filter(Boolean)
    if (name === 'quit') return
    await runCommand({trial: input.trial, name, args})
  }
}

async function hostServer(input: {
  stateRoot: string
  devEndpointDir: string
  port: number
  agent: boolean
  blind: boolean
  noDesign: boolean
}): Promise<ViteDevServer> {
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: input.port},
    plugins: [
      react(),
      unplugin.vite({
        stateRoot: input.stateRoot,
        ...(input.agent ? {} : {harnessBin: 'true', systemPrompt: false}),
        devEndpointDir: input.devEndpointDir,
        extensions: {design: {blind: input.blind}},
        withhold: [
          ...(input.blind ? ['page_screenshot'] : []),
          `${DESIGN_TOOL_PREFIX}write`,
          ...(input.noDesign ? [getDef, watchDef, validateDef].map((tool) => tool.name) : []),
        ],
      }),
    ],
  })
  await server.listen()
  return server
}

async function open(input: {
  options: Options
  server: ViteDevServer
  browser: Browser
  devEndpointDir: string
  target: GetInput
}): Promise<Trial> {
  const local = input.server.resolvedUrls?.local[0]
  if (local === undefined) throw new Error('the fixture dev server has no local url')
  const endpoint = await readFile(join(input.devEndpointDir, ENDPOINT_FILE), 'utf8')
  const {apiBase} = EndpointSchema.parse(JSON.parse(endpoint))
  const session = (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  const page = await input.browser.newPage({viewport: {width: input.options.width, height: TAB_HEIGHT}})
  await awaitPagePlaneSubscribed(page, async () => {
    await page.goto(new URL(input.options.route, new URL(local).origin).href, {waitUntil: 'domcontentloaded'})
    await injectWidget({page, apiBase})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: PAGE_DRIVER_TIMEOUT_MS})
  })
  const registered = outputOf({
    schema: getDef.outputSchema,
    raw: await rpc.registry.call({name: getDef.name, input: input.target}),
  })
  print(
    `target ${registered.target} ${registered.viewport.width}x${registered.viewport.height}` +
      ` nodes ${registered.count} tab ${input.options.width}`,
  )
  return {rpc, page, id: registered.target, session}
}

async function injectWidget(input: {page: Page; apiBase: string}): Promise<void> {
  await input.page.evaluate((base) => {
    const metas = `<meta name="conciv-api-base" content="${base}"><meta name="conciv-widget" content="{}">`
    document.head.insertAdjacentHTML('beforeend', metas)
  }, input.apiBase)
  await input.page.addScriptTag({type: 'module', content: WIDGET_BOOT})
}

async function runCommand(input: {trial: Trial; name: string; args: string[]}): Promise<void> {
  const command = COMMANDS[input.name]
  if (command === undefined)
    return print(`unknown command ${input.name}; one of ${Object.keys(COMMANDS).join(', ')}, quit`)
  await command({trial: input.trial, args: input.args}).catch((error: unknown) =>
    print(`${input.name} failed: ${String(error)}`),
  )
}

function outputOf<Schema extends z.ZodType>(input: {schema: Schema | undefined; raw: unknown}): z.output<Schema> {
  if (input.schema === undefined) throw new Error('the design tool declares no output schema')
  return input.schema.parse(input.raw)
}

async function called<Schema extends z.ZodType>(input: {
  trial: Trial
  name: string
  schema: Schema | undefined
  file: string | undefined
}): Promise<void> {
  const output = outputOf({
    schema: input.schema,
    raw: await input.trial.rpc.registry.call({name: input.name, input: {}}),
  })
  const text = JSON.stringify(output)
  if (input.file === undefined) return print(text)
  await writeFile(resolve(input.file), text)
  print(`wrote ${resolve(input.file)}`)
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
