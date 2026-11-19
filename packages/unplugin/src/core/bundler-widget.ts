import {writeFileSync} from 'node:fs'
import {findPackageJSON} from 'node:module'
import {dirname, join} from 'node:path'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
import {WIDGET_START_SPECIFIER} from './nextjs.js'
import {isEnginePort} from './widget-start.js'

export function widgetStarterPath(): string {
  const manifest = findPackageJSON(import.meta.url)
  if (manifest === undefined) throw new Error('conciv: the @conciv/unplugin package.json was not found')
  return join(dirname(manifest), 'dist', 'core', 'widget-start.js')
}

export function writeWidgetClient(root: string, port: number): string | undefined {
  if (!isEnginePort(port)) {
    console.error(
      `conciv: the engine port must be an integer from 1 to 65535, got ${String(port)}, so the page gets no widget`,
    )
    return undefined
  }
  const stateDir = concivStateDir(root)
  const path = join(stateDir, `widget-client.${String(port)}.gen.js`)
  const source = [
    `import {startConcivWidget} from '${WIDGET_START_SPECIFIER}'`,
    `startConcivWidget(${String(port)})`,
    '',
  ].join('\n')
  try {
    createConcivStateDir(stateDir)
    writeFileSync(path, source, 'utf8')
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    console.error(`conciv: could not write the widget client ${path}, so the page gets no widget: ${cause}`)
    return undefined
  }
  return path
}
