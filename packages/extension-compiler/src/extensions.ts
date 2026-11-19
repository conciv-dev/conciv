import {DOCK_REVEAL_EVENT} from '@conciv/protocol/event-bus'

export const EXTENSIONS_VIRTUAL_ID = 'virtual:conciv-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID
export const WIDGET_ROUTE = '/@conciv/widget.js'
export const EXTENSIONS_DOCK_RESOLVED_ID = `${EXTENSIONS_RESOLVED_ID}-dock`
export const WIDGET_DOCK_ROUTE = '/@conciv/widget-dock.js'

type ExtensionsSurface = 'page' | 'dock'

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

const DOCK_SCRIPT_SELECTOR = `script[src*="${WIDGET_DOCK_ROUTE}"]`

const PAGE_MOUNT = [
  `if (typeof document !== 'undefined' && !document.querySelector(${JSON.stringify(DOCK_SCRIPT_SELECTOR)}))`,
  `  mountConciv().catch((error) => console.error('[conciv] widget failed to start', error))`,
]

const DOCK_RENDERER = [
  `export default function concivDockRenderer(context) {`,
  `  const entry = context.current`,
  `  const settings = {...hostWidgetSettings(), launcher: false, defaultOpen: true, surface: 'dock'}`,
  `  const engineToken = () => context.rpc.call('conciv:engine-token')`,
  `  const conciv = createConciv({settings, engineToken})`,
  `  const setInert = (inert) => {`,
  `    if (entry.domElements.panel) entry.domElements.panel.inert = inert`,
  `  }`,
  `  const mount = (panel) => {`,
  `    panel.inert = !entry.isActive`,
  `    conciv.mount(panel).catch((error) => console.error('[conciv] widget failed to start', error))`,
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

export function extensionsModuleSource(
  apiBase?: string,
  embedEntry?: string,
  surface: ExtensionsSurface = 'page',
): string {
  const apiBaseLine =
    apiBase === undefined
      ? []
      : [`if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ = ${JSON.stringify(apiBase)}`]
  return [
    `import {${surface === 'dock' ? 'createConciv' : 'mountConciv'}} from ${JSON.stringify(embedEntry ?? '@conciv/embed')}`,
    ...apiBaseLine,
    ...(surface === 'dock' ? [...HOST_WIDGET_SETTINGS, ...DOCK_RENDERER] : PAGE_MOUNT),
    '',
  ].join('\n')
}
