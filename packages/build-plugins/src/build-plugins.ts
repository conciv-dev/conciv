import {globSync, readFileSync} from 'node:fs'
import {dirname, extname, isAbsolute, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Rolldown} from 'tsdown'
import {createGenerator} from 'unocss'
import {presetConciv} from '@internal/uno-preset'

const INLINE_SHEET = 'virtual:uno.css?inline'
const RESOLVED_SHEET = '\0conciv-inline-sheet'
const INLINE_IMPORT = /\?(?:worker&)?inline$/
const INLINED = '\0conciv-inline:'
const ASSET_TYPES: Readonly<Record<string, string>> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
}

export function inlineSheet(packageUrl: string): Rolldown.Plugin {
  const source = fileURLToPath(new URL('src', packageUrl))
  return {
    name: 'conciv:inline-sheet',
    resolveId: (id) => (id === INLINE_SHEET ? RESOLVED_SHEET : null),
    load: async (id) => {
      if (id !== RESOLVED_SHEET) return null
      const generator = await createGenerator({presets: [presetConciv({sheet: 'plugin'})]})
      const files = globSync(`${source}/**/*.{ts,tsx}`, {exclude: [`${source}/**/*.{test,spec,stories}.*`]})
      const {css} = await generator.generate(files.map((file) => readFileSync(file, 'utf8')).join('\n'))
      return `export default ${JSON.stringify(css)}`
    },
  }
}

async function workerSource(file: string): Promise<string> {
  const output = await Rolldown.build({
    input: file,
    write: false,
    platform: 'browser',
    output: {format: 'iife', minify: true},
  })
  return output.output[0].code
}

function workerModule(source: string): string {
  return [
    `const source = ${JSON.stringify(source)}`,
    'export default function InlineWorker(options) {',
    "  const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))",
    '  try {',
    '    return new Worker(url, options)',
    '  } catch {',
    "    return new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(source), options)",
    '  } finally {',
    '    URL.revokeObjectURL(url)',
    '  }',
    '}',
  ].join('\n')
}

function assetModule(file: string): string {
  if (extname(file) === '.css') return `export default ${JSON.stringify(readFileSync(file, 'utf8'))}`
  const type = ASSET_TYPES[extname(file)] ?? 'application/octet-stream'
  return `export default ${JSON.stringify(`data:${type};base64,${readFileSync(file).toString('base64')}`)}`
}

export function inlineImports(): Rolldown.Plugin {
  return {
    name: 'conciv:inline-imports',
    resolveId: {
      filter: {id: INLINE_IMPORT},
      handler: (id, importer) =>
        `${INLINED}${id.startsWith('.') && importer ? `./${relative(process.cwd(), join(dirname(importer), id))}` : id}`,
    },
    load: {
      filter: {id: /^\0conciv-inline:/},
      handler: async function (id) {
        const [path = id, query] = id.slice(INLINED.length).split('?')
        const resolved = path.startsWith('./')
          ? join(process.cwd(), path)
          : (await this.resolve(`${path}?${query}`, join(process.cwd(), 'package.json'), {skipSelf: true}))?.id.split(
              '?',
            )[0]
        if (resolved === undefined || !isAbsolute(resolved)) return this.error(`cannot resolve ${path}`)
        return query === 'worker&inline' ? workerModule(await workerSource(resolved)) : assetModule(resolved)
      },
    },
  }
}
