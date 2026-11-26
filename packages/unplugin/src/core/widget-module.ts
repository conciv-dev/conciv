import {DOCK_REVEAL_EVENT} from '@conciv/types/event-bus'

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

export type WidgetGlobals = {
  readonly apiBase: string | undefined
  readonly drive: string | undefined
}

function globalLine(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`if (typeof window !== 'undefined') window.${name} ??= ${JSON.stringify(value)}`]
}

function widgetModuleSource(surface: 'page' | 'dock', globals: WidgetGlobals, embedEntry: string): string {
  return [
    `import {${surface === 'dock' ? 'createConciv' : 'mountConciv'}} from ${JSON.stringify(embedEntry)}`,
    ...globalLine('__CONCIV_API_BASE__', globals.apiBase),
    ...globalLine('__CONCIV_DRIVE__', globals.drive),
    ...(surface === 'dock' ? [...HOST_WIDGET_SETTINGS, ...DOCK_RENDERER] : PAGE_MOUNT),
    '',
  ].join('\n')
}

export function resolveWidgetModule(id: string): string | null {
  const cut = id.search(/[?#]/)
  const bareId = cut === -1 ? id : id.slice(0, cut)
  if (bareId === WIDGET_DOCK_ROUTE) return WIDGET_DOCK_RESOLVED_ID
  return bareId === WIDGET_ROUTE ? WIDGET_RESOLVED_ID : null
}

export function loadWidgetModule(id: string, globals: WidgetGlobals, embedEntry = '@conciv/app'): string | null {
  if (id === WIDGET_DOCK_RESOLVED_ID) return widgetModuleSource('dock', globals, embedEntry)
  return id === WIDGET_RESOLVED_ID ? widgetModuleSource('page', globals, embedEntry) : null
}
