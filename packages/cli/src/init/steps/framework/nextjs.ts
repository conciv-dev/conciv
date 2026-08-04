import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {Detected} from '../../detect.js'
import type {InitContext, InitStep, ManualCard} from '../../pipeline.js'
import {readConfig, restoreBackupOnExit, unifiedDiff} from './config-edit.js'
import {wrapDefaultExport} from './engine.js'

const pluginModule = '@conciv/it/plugin/nextjs'
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
    body: 'conciv could not prove the shape of your next config. Wrap the default export yourself:',
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
    body: 'Add the three wires from the quick-start yourself:',
    snippet: `${configSnippet}\n\n${instrumentationName}:\n${instrumentationLine}\n\n${clientName}:\n${clientLine}`,
  }
}

type FileState = 'missing' | 'wired' | 'foreign'

function fileState(cwd: string, name: string, line: string): FileState {
  const path = join(cwd, name)
  if (!existsSync(path)) return 'missing'
  if (readFileSync(path, 'utf8').trim() === line) return 'wired'
  return 'foreign'
}

function configWired(cwd: string, configFile: string | null): boolean {
  const config = readConfig(cwd, configFile)
  if (config === null) return false
  return config.content.includes(pluginModule)
}

function allWired(cwd: string, configFile: string | null): boolean {
  return (
    configWired(cwd, configFile) &&
    fileState(cwd, instrumentationName, instrumentationLine) === 'wired' &&
    fileState(cwd, clientName, clientLine) === 'wired'
  )
}

function wireConfig(ctx: InitContext, configFile: string | null): ManualCard | null {
  if (configWired(ctx.cwd, configFile)) return null
  const config = readConfig(ctx.cwd, configFile)
  if (config === null) return configCard()
  const transformed = wrapDefaultExport(config.content, 'withConciv', pluginModule)
  if (!transformed.matched || transformed.output === null) return configCard()
  const release = restoreBackupOnExit(config.path, config.content)
  writeFileSync(config.path, transformed.output)
  release()
  ctx.report(unifiedDiff(config.name, config.content, transformed.output))
  return null
}

function wireFile(ctx: InitContext, name: string, line: string): ManualCard | null {
  const state = fileState(ctx.cwd, name, line)
  if (state === 'wired') return null
  if (state === 'foreign') return fileCard(name, line)
  writeFileSync(join(ctx.cwd, name), `${line}\n`)
  ctx.report(`created ${name}`)
  return null
}

export function nextjsStep(detected: Detected): InitStep {
  return {
    id: 'framework',
    title: 'Wire next.js',
    detect: async (ctx) => (allWired(ctx.cwd, detected.configFile) ? 'present' : 'missing'),
    plan: async () => ({
      summary: `wrap ${detected.configFile ?? 'your next config'} with withConciv and create ${instrumentationName} + ${clientName}`,
      wouldEdit: [...(detected.configFile === null ? [] : [detected.configFile]), instrumentationName, clientName],
    }),
    apply: async (ctx) => {
      const cards = [
        wireConfig(ctx, detected.configFile),
        wireFile(ctx, instrumentationName, instrumentationLine),
        wireFile(ctx, clientName, clientLine),
      ].filter((card) => card !== null)
      if (cards.length > 0) return {status: 'manual', cards}
      return {status: 'done'}
    },
    verify: async (ctx) => allWired(ctx.cwd, detected.configFile),
    manualCard: () => quickStartCard(),
  }
}
