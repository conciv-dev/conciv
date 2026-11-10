import {isAbsolute, join} from 'node:path'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {text as bodyText} from 'node:stream/consumers'
import {eq} from 'drizzle-orm'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {components, concivHome, withHomeDb} from '@conciv/db'
import type {ExtensionDevServer, ExtensionDevServerInput} from '@conciv/extension'
import {PREVIEW_ROUTE} from '../../shared/catalog-defs.js'
import {moduleScripts} from './module-scripts.js'
import {parseModule} from './parse-module.js'

export function createPreviewServer(input: ExtensionDevServerInput): ExtensionDevServer {
  const home = concivHome({...(input.homeDir === undefined ? {} : {homeDir: input.homeDir}), env: process.env})
  const disk = createStorage({driver: fsDriver({base: input.root, readOnly: true})})
  const framework = frameworkOf({plugins: input.plugins, disk})
  return {
    async middleware(request, response, next) {
      const path = new URL(request.url ?? '', LOCAL).pathname
      if (!path.startsWith(PREVIEW_ROUTE)) return next()
      const rest = path.slice(PREVIEW_ROUTE.length)
      if (request.method === POST && rest.endsWith(ERROR_SUFFIX))
        return failed({home, id: rest.slice(0, -ERROR_SUFFIX.length), request, response})
      const html = await input.html({url: path, html: shell(rest)})
      response.setHeader(CONTENT_TYPE, HTML)
      response.end(html)
    },
    resolveId: (id) => (id.startsWith(VIRTUAL) ? `${NUL}${id}` : null),
    async load(id) {
      if (!id.startsWith(`${NUL}${VIRTUAL}`)) return null
      const componentId = id.slice(NUL.length + VIRTUAL.length)
      const found = withHomeDb(home, (db) => db.select().from(components).where(eq(components.id, componentId)).get())
      return mountModule({
        framework: await framework,
        found: found ?? null,
        id: componentId,
      })
    },
  }
}

type Framework = 'react' | 'solid'

type Found = typeof components.$inferSelect

const LOCAL = 'http://localhost'
const POST = 'POST'
const ERROR_SUFFIX = '/error'
const CONTENT_TYPE = 'content-type'
const HTML = 'text/html'
const VIRTUAL = 'virtual:conciv-preview/'
const NUL = '\0'
const ROOT_ID = 'conciv-preview'
const INDEX_HTML = 'index.html'
const PROJECT_RELATIVE = './'
const FS_PREFIX = '/@fs'
const REACT_PLUGIN = 'vite:react'
const SOLID_PLUGIN = 'solid'
const REACT_DOM = 'react-dom'
const SOLID_WEB = 'solid-js/web'
const NEWLINE = '\n'

async function failed(input: {home: string; id: string; request: IncomingMessage; response: ServerResponse}) {
  const {home, id, request, response} = input
  const body = await bodyText(request)
  const line = body.split(NEWLINE)[0] ?? ''
  withHomeDb(home, (db) => db.update(components).set({previewError: line}).where(eq(components.id, id)).run())
  response.end()
}

function shell(id: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8" /><meta name="conciv-no-widget" /><title>preview</title></head>',
    `<body><div id="${ROOT_ID}"></div>`,
    `<script type="module" src="/@id/${VIRTUAL}${encodeURIComponent(id)}"></script>`,
    '</body>',
    '</html>',
  ].join(NEWLINE)
}

async function frameworkOf(input: {plugins: string[]; disk: Storage}): Promise<Framework> {
  const react = input.plugins.some((name) => name.startsWith(REACT_PLUGIN))
  const solid = input.plugins.some((name) => name === SOLID_PLUGIN)
  if (react !== solid) return react ? 'react' : 'solid'
  return entryFramework(input.disk)
}

async function entryFramework(disk: Storage): Promise<Framework> {
  const html = await text({disk, file: INDEX_HTML})
  const [entry] = html === null ? [] : moduleScripts(html)
  const source = entry === undefined ? null : await text({disk, file: entry})
  if (entry === undefined || source === null) return 'react'
  const {imports} = parseModule({file: entry, source})
  if (imports.some((request) => request.startsWith(SOLID_WEB))) return 'solid'
  return imports.some((request) => request.startsWith(REACT_DOM)) ? 'react' : 'solid'
}

async function text(input: {disk: Storage; file: string}): Promise<string | null> {
  const raw = await input.disk.getItemRaw<Uint8Array>(input.file).catch(() => null)
  return raw === null || raw === undefined ? null : new TextDecoder().decode(raw)
}

function mountModule(input: {framework: Framework; found: Found | null; id: string}): string {
  const {found, id} = input
  const report = [
    `const root = document.getElementById(${JSON.stringify(ROOT_ID)})`,
    'function report(error) {',
    `  const line = String(error instanceof Error ? error.message : error).split(${JSON.stringify(NEWLINE)})[0]`,
    "  setTimeout(() => { root.textContent = 'error: ' + line })",
    `  void fetch(${JSON.stringify(`${PREVIEW_ROUTE}${id}${ERROR_SUFFIX}`)}, {method: 'POST', body: line})`,
    '}',
  ]
  if (found === null) return [...report, `report(${JSON.stringify(`no component ${id} in the catalog`)})`].join(NEWLINE)
  const name = found.names[0] ?? ''
  const story = found.story === null ? null : storyPath(found.story)
  return [
    ...MOUNTS[input.framework].imports,
    ...report,
    'async function storyArgs() {',
    `  const path = ${JSON.stringify(story)}`,
    '  if (path === null) return {}',
    '  const stories = await import(/* @vite-ignore */ path)',
    '  const meta = stories.default ?? {}',
    "  const first = Object.entries(stories).find(([key, value]) => key !== 'default' && value !== null && typeof value === 'object' && 'args' in value)",
    '  return {...(meta.args ?? {}), ...(first === undefined ? {} : first[1].args)}',
    '}',
    'try {',
    `  const module = await import(${JSON.stringify(importPath(found.specifier))})`,
    `  const Component = module[${JSON.stringify(name)}]`,
    '  const props = await storyArgs()',
    `  ${MOUNTS[input.framework].mount}`,
    '} catch (error) {',
    '  report(error)',
    '}',
  ].join(NEWLINE)
}

const MOUNTS: Record<Framework, {imports: string[]; mount: string}> = {
  react: {
    imports: ["import {createElement} from 'react'", "import {createRoot} from 'react-dom/client'"],
    mount: 'createRoot(root, {onUncaughtError: report, onCaughtError: report}).render(createElement(Component, props))',
  },
  solid: {
    imports: ["import {createComponent} from 'solid-js'", "import {render} from 'solid-js/web'"],
    mount: 'render(() => createComponent(Component, props), root)',
  },
}

function importPath(specifier: string): string {
  if (specifier.startsWith(PROJECT_RELATIVE)) return specifier.slice(PROJECT_RELATIVE.length - 1)
  return isAbsolute(specifier) ? join(FS_PREFIX, specifier) : specifier
}

function storyPath(story: string): string {
  return isAbsolute(story) ? join(FS_PREFIX, story) : `/${story}`
}
