import {mkdirSync, writeFileSync} from 'node:fs'
import {findPackageJSON} from 'node:module'
import {dirname, join} from 'node:path'
import {WIDGET_START_SPECIFIER} from './nextjs.js'
import {isEnginePort} from './widget-start.js'

const CLIENT_FILE = join('.conciv', 'widget-client.gen.js')

export function widgetStarterPath(): string {
  const manifest = findPackageJSON(import.meta.url)
  if (manifest === undefined) throw new Error('conciv: the @conciv/unplugin package.json was not found')
  return join(dirname(manifest), 'dist', 'core', 'widget-start.js')
}

export function writeWidgetClient(root: string, port: number): string {
  if (!isEnginePort(port)) {
    throw new Error(`conciv: the engine port must be an integer from 1 to 65535, got ${String(port)}`)
  }
  const path = join(root, CLIENT_FILE)
  mkdirSync(dirname(path), {recursive: true})
  const source = [
    `import {startConcivWidget} from '${WIDGET_START_SPECIFIER}'`,
    'export const entries = []',
    `startConcivWidget(${String(port)})`,
    '',
  ].join('\n')
  writeFileSync(path, source, 'utf8')
  return path
}
