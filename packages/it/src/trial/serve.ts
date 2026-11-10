import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {parseArgs} from 'node:util'
import {chromium} from 'playwright'
import {z} from 'zod'
import {CHAT_HISTORY_PAGE_SIZE, type NativeSessionRef} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {renderTargets} from '../../test/fixtures/design/render-targets.js'
import {hostServer} from './host-server.js'
import {open} from './open.js'
import {readCommands} from './read-commands.js'

export async function serve(argv: string[]): Promise<void> {
  process.env.LAUNCH_EDITOR = 'true'
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: {type: 'string'},
      wave: {type: 'string'},
      lane: {type: 'string'},
      route: {type: 'string', default: '/'},
      width: {type: 'string', default: '1280'},
      height: {type: 'string', default: String(TAB_HEIGHT)},
      'color-scheme': {type: 'string', default: COLOR_SCHEME.enum.light},
      image: {type: 'string', multiple: true, default: []},
      figma: {type: 'string', multiple: true, default: []},
      document: {type: 'string', multiple: true, default: []},
      widget: {type: 'string'},
      model: {type: 'string'},
      port: {type: 'string', default: '0'},
      render: {type: 'string'},
      agent: {type: 'boolean', default: false},
      blind: {type: 'boolean', default: false},
      'no-design': {type: 'boolean', default: false},
      'no-catalog': {type: 'boolean', default: false},
      show: {type: 'string', multiple: true, default: []},
      open: {type: 'string', multiple: true, default: []},
      'browser-driver': {type: 'string'},
    },
  })
  if (values.render !== undefined) return render(resolve(values.render))
  if (values.project === undefined)
    throw new Error('trial serve takes --project <dir>, the vite root that keeps .conciv')
  const options = {
    ...values,
    project: resolve(values.project),
    noDesign: values['no-design'],
    noCatalog: values['no-catalog'],
    browserDriver: values['browser-driver'],
    show: SHOWN.parse(values.show),
    widget: getDef.inputSchema.shape.widget.parse(values.widget),
    open: OPENED.parse(values.open),
    width: Number(values.width),
    height: Number(values.height),
    colorScheme: COLOR_SCHEME.parse(values['color-scheme']),
    port: Number(values.port),
  }
  return served({options, commands: positionals})
}

type Options = {
  project: string
  wave?: string
  lane?: string
  route: string
  width: number
  height: number
  colorScheme: z.output<typeof COLOR_SCHEME>
  image: string[]
  figma: string[]
  document: string[]
  widget: GetInput['widget']
  model?: string
  port: number
  agent: boolean
  blind: boolean
  noDesign: boolean
  noCatalog: boolean
  show: z.output<typeof SHOWN>
  open: z.output<typeof OPENED>
  browserDriver?: string
}

type GetInput = z.input<typeof getDef.inputSchema>

type Trial = Awaited<ReturnType<typeof open>>

const TAB_HEIGHT = 720
const LAUNCH_ARGS = ['--disable-features=LocalNetworkAccessChecks']
const SHOWN = z.array(z.enum(['progress']))
const OPENED = z.array(z.enum(['query']))
const COLOR_SCHEME = z.enum(['light', 'dark'])
const RunsSchema = z.array(z.object({run: z.number()}))
const TargetsSchema = z.array(z.object({width: z.number(), height: z.number(), image: z.string()}))
const ImportedSchema = z.object({runId: z.number()})
const [getDef] = DESIGN_TOOLS

async function render(dir: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    await renderTargets({browser, dir})
    print(`rendered the design targets into ${dir}`)
  } finally {
    await browser.close()
  }
}

async function served(input: {options: Options; commands: string[]}): Promise<void> {
  const {options} = input
  const target = await targetInput(options)
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-trial-endpoint-'))
  const printed: string[] = []
  const server = await hostServer({...options, devEndpointDir, printed})
  const browser = await chromium.launch({args: [...LAUNCH_ARGS, ...debuggingArgs(options.browserDriver)]})
  try {
    const trial = await open({options, server, browser, devEndpointDir, target, printed})
    print(`state ${concivStateDir(options.project)}`)
    const run = {
      ...(options.wave === undefined ? {} : {wave: options.wave}),
      ...(options.lane === undefined ? {} : {lane: options.lane}),
    }
    await readCommands({trial, commands: input.commands, run})
    await importedRun({trial, options})
  } finally {
    await browser.close()
    await server.close()
    await rm(devEndpointDir, {recursive: true, force: true})
  }
}

async function importedRun(input: {trial: Trial; options: Options}): Promise<void> {
  const {trial, options} = input
  const runs = RunsSchema.parse(await trial.rpc.db.read({from: 'design_runs', select: ['run']}))
  if (runs.length === 0) return print(`no run in ${options.project}; nothing imported into the runs store`)
  const dir = await mkdtemp(join(tmpdir(), 'conciv-trial-artifacts-'))
  try {
    const design = join(dir, 'design')
    const screenshots = join(dir, 'screenshots')
    await Promise.all([mkdir(design), mkdir(screenshots)])
    const targets = TargetsSchema.parse(
      await trial.rpc.db.read({from: 'design_targets', select: ['width', 'height', 'image']}),
    )
    for (const {width, height, image} of targets) {
      await copyFile(join(concivStateDir(options.project), 'design', image), join(design, `${width}.png`))
      await trial.page.setViewportSize({width, height})
      await trial.page.screenshot({path: join(screenshots, `${width}.png`), fullPage: true})
    }
    const transcript = await transcriptFile({trial, dir})
    const imported = ImportedSchema.parse(
      await trial.rpc.extensions.run({
        name: 'design:run-import',
        args: [options.project],
        options: {
          design,
          screenshots,
          source: join(options.project, 'src'),
          ...(transcript === null ? {} : {transcript}),
          ...(options.lane === undefined ? {} : {lane: options.project}),
        },
      }),
    )
    print(`store run ${imported.runId}`)
  } finally {
    await rm(dir, {recursive: true, force: true})
  }
}

async function transcriptFile(input: {trial: Trial; dir: string}): Promise<string | null> {
  const {native} = await input.trial.rpc.sessions.get({sessionId: input.trial.session})
  if (native === null) return null
  const messages = await transcriptPages({trial: input.trial, native, before: null})
  const file = join(input.dir, 'transcript.jsonl')
  await writeFile(file, messages.map((message) => JSON.stringify(message)).join('\n'))
  return file
}

async function transcriptPages(input: {
  trial: Trial
  native: NativeSessionRef
  before: string | null
}): Promise<unknown[]> {
  const {trial, native} = input
  const page = await trial.rpc.sessions.preview({
    harness: native.harnessKind,
    nativeId: native.nativeId,
    cwd: native.cwd,
    before: input.before,
    limit: CHAT_HISTORY_PAGE_SIZE,
  })
  if (page.earlier === null) return page.messages
  return [...(await transcriptPages({...input, before: page.earlier})), ...page.messages]
}

function debuggingArgs(endpoint: string | undefined): string[] {
  if (endpoint === undefined) return []
  return [`--remote-debugging-port=${new URL(endpoint).port}`]
}

async function targetInput(options: Options): Promise<GetInput> {
  const widget = options.widget === undefined ? {} : {widget: options.widget}
  return {...(await targetRef(options)), ...widget}
}

async function targetRef(options: Options): Promise<GetInput> {
  const {figma, document} = options
  const image = options.image.map((file) => resolve(file))
  if (document.length > 0) {
    if (figma.length !== document.length || image.length !== document.length)
      throw new Error('every --document needs its --figma and --image')
    const parsed = await Promise.all(
      document.map(async (file): Promise<unknown> => JSON.parse(await readFile(resolve(file), 'utf8'))),
    )
    const [one] = parsed
    if (parsed.length === 1) return {figma: figma[0], image: image[0], document: one}
    return {figma, image, document: parsed}
  }
  if (image.length === 1 && figma.length === 0) return {image: image[0]}
  if (figma.length > 0 && image.length === 0) return {figma: figma.length === 1 ? figma[0] : figma}
  throw new Error('--image <png> or --figma <link> is required')
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
