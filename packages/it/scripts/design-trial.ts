import {mkdtemp, readFile, rm} from 'node:fs/promises'
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
import {makeExtRpcClient} from '@conciv/extension'
import {DiffReportSchema, MARK_KINDS, type DiffReport} from '@conciv/extension-design/defs'
import type {XrayRouter} from '@conciv/extension-design/xray-routes'
import {unplugin} from '../src/plugin-instance.js'
import {renderTargets} from '../test/fixtures/design/render-targets.js'

const HOST_ROOT = fileURLToPath(new URL('../test/fixtures/design/host/', import.meta.url))
const ENDPOINT_FILE = 'dev-endpoint.json'
const TAB_HEIGHT = 720
const PAGE_DRIVER_TIMEOUT_MS = 30_000
const TOP_ROWS = 12
const WIDGET_BOOT = `${react.preambleCode.replace('__BASE__', '/')}\nawait import(${JSON.stringify(EXTENSIONS_ROUTE)})`

const EndpointSchema = z.object({apiBase: z.string().min(1)})
const TargetSchema = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
  text: z.object({runs: z.number()}).default({runs: 0}),
  stage: z.string().nullable().default(null),
  brief: z.array(z.string()).default([]),
  next: z.string(),
})
const MarkKindSchema = z.enum(MARK_KINDS)

type Options = {route: string; width: number; image?: string; state?: string; port: number}

type Trial = {
  rpc: RpcClient
  xray: ReturnType<typeof makeExtRpcClient<XrayRouter>>
  page: Page
  id: string
  session: SessionId
}

type TrialDirs = {stateRoot: string; devEndpointDir: string; temporary: string[]}

type ComponentReport = DiffReport['components'][number]

type Delta = ComponentReport['deltas'][number]

type Command = (input: {trial: Trial; args: string[]}) => Promise<void>

const COMMANDS: Record<string, Command> = {
  diff: async ({trial}) => {
    const started = performance.now()
    const report = DiffReportSchema.parse(await trial.rpc.registry.call({name: 'design_diff', input: {}}))
    print(diffTable({report, ms: Math.round(performance.now() - started)}))
  },
  status: async ({trial}) => {
    print(JSON.stringify(await trial.rpc.registry.call({name: 'design_status', input: {}})))
  },
  pin: async ({trial, args: [node = '', path = '']}) => {
    const result = await trial.xray.xray.pin({id: trial.id, node, path, session: trial.session})
    print(`pinned ${JSON.stringify(result.decision)}`)
  },
  mark: async ({trial, args: [kind = '', node = '', value]}) => {
    const result = await trial.xray.xray.mark({
      id: trial.id,
      kind: MarkKindSchema.parse(kind),
      node,
      session: trial.session,
      ...(value === undefined ? {} : {value: numberOrText(value)}),
    })
    print(`marked ${JSON.stringify(result.decision)}`)
  },
  accept: async ({trial}) => {
    const result = await trial.xray.xray.accept({id: trial.id})
    print(`accepted run ${result.target.acceptedRun ?? 'none'}`)
  },
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
      state: {type: 'string'},
      port: {type: 'string', default: '0'},
      render: {type: 'string'},
    },
  })
  if (values.render !== undefined) return render(resolve(values.render))
  return serve({options: {...values, width: Number(values.width), port: Number(values.port)}, commands: positionals})
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
  const image = requiredImage(options.image)
  const dirs = await trialDirs(options.state)
  const server = await hostServer({...dirs, port: options.port})
  const browser = await chromium.launch({args: ['--disable-features=LocalNetworkAccessChecks']})
  try {
    const trial = await open({options, server, browser, devEndpointDir: dirs.devEndpointDir, image})
    print(`state ${dirs.stateRoot}`)
    await readCommands({trial, commands: input.commands})
  } finally {
    await browser.close()
    await server.close()
    await Promise.all(dirs.temporary.map((dir) => rm(dir, {recursive: true, force: true})))
  }
}

function requiredImage(image: string | undefined): string {
  if (image === undefined) throw new Error('--image <png> is required')
  return resolve(image)
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

async function hostServer(input: {stateRoot: string; devEndpointDir: string; port: number}): Promise<ViteDevServer> {
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: input.port},
    plugins: [
      react(),
      unplugin.vite({
        stateRoot: input.stateRoot,
        harnessBin: 'true',
        systemPrompt: false,
        devEndpointDir: input.devEndpointDir,
        extensions: {design: {}},
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
  image: string
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
  const registered = TargetSchema.parse(await rpc.registry.call({name: 'design_target', input: {image: input.image}}))
  print(
    `target ${registered.id} ${registered.width}x${registered.height} text runs ${registered.text.runs}` +
      ` stage ${shown(registered.stage)} tab ${input.options.width}`,
  )
  print(numbered(registered.brief))
  return {rpc, xray: makeExtRpcClient<XrayRouter>(apiBase, 'design'), page, id: registered.id, session}
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

function diffTable(input: {report: DiffReport; ms: number}): string {
  const {report} = input
  const head =
    `round ${report.round}  stage ${shown(report.stage)}  stop ${shown(report.stop)}  budgetLeft ${report.budgetLeft}` +
    `  score [${report.score.join(', ')}]  sources ${report.sources.join(',')}` +
    `  capturePath ${shown(report.capturePath)}  partial ${report.partial}  ms ${input.ms}`
  const deltas = report.components.flatMap((component) => component.deltas.map((delta) => deltaRow({component, delta})))
  const unmatched = report.unmatched
    .filter((entry) => Boolean(entry.stage))
    .map((entry) => [entry.kind, shown(entry.label), '-', '-', shown(entry.node), '-'])
  const rows = [...unmatched, ...deltas].slice(0, TOP_ROWS)
  return [
    head,
    numbered(report.brief),
    table(rows),
    `rows ${deltas.length} deltas, ${unmatched.length} counted unmatched, ${report.unmatched.length} unmatched in all`,
    ...report.warnings.map((warning) => `warning ${shown(warning.warning)} ${warning.live}`),
    ...report.pinsLost.map((pin) => `pin lost ${pin}`),
  ].join('\n')
}

function deltaRow(input: {component: ComponentReport; delta: Delta}): string[] {
  const {component, delta} = input
  return [
    delta.kind,
    `${delta.live} -> ${delta.target}`,
    shown(delta.source),
    shown(delta.confidence?.toFixed(2)),
    `${shown(component.nodes?.join(','))} ${component.path ?? component.selector}`,
    where(delta),
  ]
}

function where(delta: Delta): string {
  if (delta.file === undefined) return '-'
  return `${delta.file}:${delta.line ?? 0}`
}

function table(rows: string[][]): string {
  const widths = rows.reduce<number[]>(
    (widest, row) => row.map((cell, index) => Math.max(widest[index] ?? 0, cell.length)),
    [],
  )
  return rows.map((row) => `  ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ')}`).join('\n')
}

function numbered(lines: string[]): string {
  return lines.map((line, index) => `  ${index + 1}. ${line}`).join('\n')
}

function numberOrText(value: string): number | string {
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

function shown(value: string | null | undefined): string {
  return value ?? '-'
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
