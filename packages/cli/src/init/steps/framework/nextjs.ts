import {writeFile} from 'node:fs/promises'
import {join, posix} from 'node:path'
import type {Detected} from '../../detect.js'
import {captureFile, pathExists, readOptionalText} from '../../interrupt.js'
import type {ManualCard} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'
import {readConfig, writeConfigChange} from './config-edit.js'
import {defaultExportWrapped, wrapDefaultExport} from './engine.js'

const pluginModule = '@conciv/it/plugin/nextjs'
const wrapperName = 'withConciv'
const widgetModule = '@conciv/it/plugin/nextjs/widget'
const instrumentationName = 'instrumentation.ts'
const clientName = 'instrumentation-client.ts'
const instrumentationLine = `export {register} from '${pluginModule}'`
const clientLine = `import '${widgetModule}'`

const configSnippet = `import {withConciv} from '${pluginModule}'
export default withConciv(nextConfig)`

function configCard(): ManualCard {
  return {
    title: 'Wrap your next config',
    body: 'conciv could not prove the shape of your next config. Wrap the default export yourself. Full steps: https://conciv.dev/docs/quick-start/nextjs',
    snippet: configSnippet,
  }
}

function fileCard(name: string, line: string): ManualCard {
  return {
    title: `Wire ${name}`,
    body: `${name} already exists with other content. Add this line yourself:`,
    snippet: line,
  }
}

function quickStartCard(): ManualCard {
  return {
    title: 'Wire conciv into next.js',
    body: 'Add the three wires from the quick-start yourself. Full steps: https://conciv.dev/docs/quick-start/nextjs',
    snippet: `${configSnippet}\n\n${instrumentationName}:\n${instrumentationLine}\n\n${clientName}:\n${clientLine}`,
  }
}

type FileState = 'missing' | 'wired' | 'foreign'

type InstrumentationFiles = {instrumentation: string; client: string}

async function someExist(cwd: string, names: readonly string[]): Promise<boolean> {
  const found = await Promise.all(names.map((name) => pathExists(join(cwd, name))))
  return found.includes(true)
}

async function readInstrumentationFiles(cwd: string): Promise<InstrumentationFiles> {
  const inSrc = !(await someExist(cwd, ['app', 'pages'])) && (await someExist(cwd, ['src/app', 'src/pages']))
  const folder = inSrc ? 'src' : ''
  return {instrumentation: posix.join(folder, instrumentationName), client: posix.join(folder, clientName)}
}

async function fileState(cwd: string, name: string, line: string): Promise<FileState> {
  const content = await readOptionalText(join(cwd, name))
  if (content === null) return 'missing'
  if (content.trim() === line) return 'wired'
  return 'foreign'
}

async function configWired(cwd: string, configFile: string | null): Promise<boolean> {
  const config = await readConfig(cwd, configFile)
  if (config === null) return false
  return defaultExportWrapped(config.content, wrapperName, pluginModule)
}

async function allWired(cwd: string, configFile: string | null): Promise<boolean> {
  const files = await readInstrumentationFiles(cwd)
  return (
    (await configWired(cwd, configFile)) &&
    (await fileState(cwd, files.instrumentation, instrumentationLine)) === 'wired' &&
    (await fileState(cwd, files.client, clientLine)) === 'wired'
  )
}

async function wireConfig(ctx: InitContext, configFile: string | null): Promise<ManualCard | null> {
  if (await configWired(ctx.cwd, configFile)) return null
  const config = await readConfig(ctx.cwd, configFile)
  if (config === null) return configCard()
  const transformed = wrapDefaultExport(config.content, wrapperName, pluginModule)
  if (!transformed.matched || transformed.output === null) return configCard()
  await writeConfigChange(ctx, config, transformed.output)
  return null
}

async function wireFile(ctx: InitContext, name: string, line: string): Promise<ManualCard | null> {
  const state = await fileState(ctx.cwd, name, line)
  if (state === 'wired') return null
  if (state === 'foreign') return fileCard(name, line)
  const path = join(ctx.cwd, name)
  ctx.backup(await captureFile(path))
  await writeFile(path, `${line}\n`)
  ctx.report(`created ${name}`)
  return null
}

export function nextjsStep(detected: Detected): InitStep {
  return {
    id: 'framework',
    title: 'Wire next.js',
    running: 'Wiring next.js…',
    completed: 'Wired next.js',
    detect: async (ctx) => ((await allWired(ctx.cwd, detected.configFile)) ? 'present' : 'missing'),
    plan: async (ctx) => {
      const files = await readInstrumentationFiles(ctx.cwd)
      return {
        summary: `wrap ${detected.configFile ?? 'your next config'} with withConciv and create ${files.instrumentation} + ${files.client}`,
        wouldEdit: [
          ...(detected.configFile === null ? [] : [detected.configFile]),
          files.instrumentation,
          files.client,
        ],
      }
    },
    apply: async (ctx) => {
      const files = await readInstrumentationFiles(ctx.cwd)
      const cards = [
        await wireConfig(ctx, detected.configFile),
        await wireFile(ctx, files.instrumentation, instrumentationLine),
        await wireFile(ctx, files.client, clientLine),
      ].filter((card) => card !== null)
      if (cards.length > 0) return {status: 'manual', cards}
      return {status: 'done'}
    },
    verify: (ctx) => allWired(ctx.cwd, detected.configFile),
    manualCard: () => quickStartCard(),
  }
}
