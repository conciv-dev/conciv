import {DOCK_REVEAL_EVENT} from '@conciv/types/event-bus'
import type {LogLevel} from '@conciv/types/config-types'
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {WIDGET_START_SPECIFIER} from './nextjs.js'
import {unpluginErrors} from '@conciv/errors'

export const WIDGET_ROUTE = '/@conciv/widget.js'
export const WIDGET_DOCK_ROUTE = '/@conciv/widget-dock.js'

const WIDGET_RESOLVED_ID = '\0conciv-widget'
const WIDGET_DOCK_RESOLVED_ID = '\0conciv-widget-dock'

const DOCK_SCRIPT_SELECTOR = `script[src*="${WIDGET_DOCK_ROUTE}"]`

const HOST_WIDGET_SETTINGS = [
  `function hostWidgetSettings() {`,
  `  try {`,
  `    const parsed = JSON.parse(document.querySelector('meta[name="conciv-widget"]')?.content ?? '{}')`,
  `    return typeof parsed === 'object' && parsed !== null ? parsed : {}`,
  `  } catch {`,
  `    return {}`,
  `  }`,
  `}`,
]

function pageMount(logLevel: LogLevel): string[] {
  return [
    `if (typeof document !== 'undefined' && !document.querySelector(${JSON.stringify(DOCK_SCRIPT_SELECTOR)}))`,
    `  mountConciv([], ${JSON.stringify(logLevel)}).catch(logWidgetFailure)`,
  ]
}

function dockRenderer(logLevel: LogLevel): string[] {
  return [
    `export default function concivDockRenderer(context) {`,
    `  const entry = context.current`,
    `  const settings = {...hostWidgetSettings(), launcher: false, defaultOpen: true, surface: 'dock'}`,
    `  const engineToken = () => context.rpc.call('conciv:engine-token')`,
    `  const conciv = createConciv({settings, engineToken, logLevel: ${JSON.stringify(logLevel)}})`,
    `  const setInert = (inert) => {`,
    `    if (entry.domElements.panel) entry.domElements.panel.inert = inert`,
    `  }`,
    `  const mount = (panel) => {`,
    `    panel.inert = !entry.isActive`,
    `    conciv.mount(panel).catch(logWidgetFailure)`,
    `  }`,
    `  entry.events.on('entry:activated', () => setInert(false))`,
    `  entry.events.on('entry:deactivated', () => setInert(true))`,
    `  window.addEventListener(${JSON.stringify(DOCK_REVEAL_EVENT)}, (event) => {`,
    `    if (entry.isActive) return`,
    `    event.preventDefault()`,
    `    void context.docks.switchEntry(entry.entryMeta.id)`,
    `  })`,
    `  entry.events.on('dom:panel:mounted', mount)`,
    `  if (entry.domElements.panel) mount(entry.domElements.panel)`,
    `}`,
  ]
}

export type WidgetModuleOptions = {
  readonly apiBase: string | undefined
  readonly embedEntry: string
  readonly logLevel: LogLevel
}

function widgetModuleSource(surface: 'page' | 'dock', options: WidgetModuleOptions): string {
  const apiBaseLine =
    options.apiBase === undefined
      ? []
      : [`if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ ??= ${JSON.stringify(options.apiBase)}`]
  return [
    `import {${surface === 'dock' ? 'createConciv' : 'mountConciv'}} from ${JSON.stringify(options.embedEntry)}`,
    `import {logWidgetFailure} from ${JSON.stringify(WIDGET_START_SPECIFIER)}`,
    ...apiBaseLine,
    ...(surface === 'dock'
      ? [...HOST_WIDGET_SETTINGS, ...dockRenderer(options.logLevel)]
      : pageMount(options.logLevel)),
    '',
  ].join('\n')
}

function packageRoot(directory: string): string {
  if (existsSync(join(directory, 'package.json'))) return directory
  const parent = dirname(directory)
  if (parent === directory) throw unpluginErrors.PACKAGE_FOLDER_NOT_FOUND()
  return packageRoot(parent)
}

export function widgetStarterPath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), 'dist', 'core', 'widget-start.js')
}

export function resolveWidgetModule(id: string): string | null {
  if (id === WIDGET_START_SPECIFIER) return widgetStarterPath()
  const cut = id.search(/[?#]/)
  const bareId = cut === -1 ? id : id.slice(0, cut)
  if (bareId === WIDGET_DOCK_ROUTE) return WIDGET_DOCK_RESOLVED_ID
  return bareId === WIDGET_ROUTE ? WIDGET_RESOLVED_ID : null
}

export function loadWidgetModule(id: string, options: WidgetModuleOptions): string | null {
  if (id === WIDGET_DOCK_RESOLVED_ID) return widgetModuleSource('dock', options)
  return id === WIDGET_RESOLVED_ID ? widgetModuleSource('page', options) : null
}
