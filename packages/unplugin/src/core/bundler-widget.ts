import {mkdirSync, writeFileSync} from 'node:fs'
import {findPackageJSON} from 'node:module'
import {dirname, join} from 'node:path'

const CLIENT_FILE = join('.conciv', 'widget-client.gen.js')

function widgetStarterPath(): string {
  const manifest = findPackageJSON(import.meta.url)
  if (manifest === undefined) throw new Error('conciv: the @conciv/unplugin package.json was not found')
  return join(dirname(manifest), 'dist', 'core', 'widget-start.js')
}

export function writeWidgetClient(root: string, port: number): string {
  const path = join(root, CLIENT_FILE)
  mkdirSync(dirname(path), {recursive: true})
  const source = [
    `import {startConcivWidget} from ${JSON.stringify(widgetStarterPath())}`,
    'export const entries = []',
    `startConcivWidget(${JSON.stringify(`http://127.0.0.1:${port}`)})`,
    '',
  ].join('\n')
  writeFileSync(path, source, 'utf8')
  return path
}
