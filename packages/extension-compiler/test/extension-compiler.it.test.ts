import {describe, expect, it} from 'vitest'
import {
  EXTENSIONS_DOCK_RESOLVED_ID,
  WIDGET_DOCK_ROUTE,
  EXTENSIONS_RESOLVED_ID,
  WIDGET_ROUTE,
  EXTENSIONS_VIRTUAL_ID,
  extensionsModuleSource,
} from '../src/extensions.js'
import {isClientEntry, transformConcivModule, resolveExtensionsModule} from '../src/vite-plumbing.js'
import {splitExtension} from '../src/split-extension.js'
import {compileExtensionSolid} from '../src/compile-extension.js'
import {scaffold} from '@conciv/extension/catalog'

describe('client entry inject', () => {
  describe('client-entry module-graph injection', () => {
    it('matches framework client-entry ids, not ordinary modules', () => {
      expect(isClientEntry('virtual:tanstack-start-dev-client-entry')).toBe(true)
      expect(isClientEntry('\0virtual:tanstack-start-client-entry')).toBe(true)
      expect(isClientEntry('/src/main.tsx')).toBe(false)
      expect(isClientEntry('/src/routes/__root.tsx')).toBe(false)
    })

    it('appends a dynamic import of the extensions module to the client entry (not hoisted above the preamble)', () => {
      const out = transformConcivModule(
        'await import("/entry.client.tsx")',
        'virtual:tanstack-start-dev-client-entry',
        false,
      )
      expect(out).not.toBeNull()
      const code = (out as {code: string}).code
      expect(code).toContain(`import(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})`)
      expect(code).not.toMatch(new RegExp(`^\\s*import\\s+['"]${EXTENSIONS_VIRTUAL_ID}`, 'm'))
    })

    it('does not inject on the SSR pass (the entry is client-only)', () => {
      const out = transformConcivModule(
        'await import("/entry.client.tsx")',
        'virtual:tanstack-start-dev-client-entry',
        true,
      )
      if (out && 'code' in out) expect(out.code).not.toContain(EXTENSIONS_VIRTUAL_ID)
    })

    it('does not double-inject when the entry already imports the extensions module (HMR re-transform)', () => {
      const already = `await import("/entry.client.tsx")\nimport(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})\n`
      const out = transformConcivModule(already, 'virtual:tanstack-start-dev-client-entry', false)
      expect(out).toBeNull()
    })

    it('bakes the engine origin into the extensions module as the window global (Next-style seam)', () => {
      const source = extensionsModuleSource('http://127.0.0.1:41700')
      expect(source).toContain('window.__CONCIV_API_BASE__ = "http://127.0.0.1:41700"')
    })

    it('exports a dock renderer instead of mounting on the page when the surface is dock', () => {
      const source = extensionsModuleSource(undefined, undefined, 'dock')
      expect(source).toContain('export default function concivDockRenderer')
      expect(source).toContain('createConciv')
      expect(source).not.toContain('mountConciv')
    })

    it('omits the window global when no api base is known (classic path uses the meta tag)', () => {
      const source = extensionsModuleSource()
      expect(source).not.toContain('__CONCIV_API_BASE__')
    })
  })
})

describe('extension isolation', () => {
  const ID = '/proj/conciv/extensions/iso.tsx'

  async function compileClient(source: string): Promise<string> {
    const split = splitExtension(source, ID, 'browser')
    const compiled = await compileExtensionSolid(split?.code ?? source, ID, false)
    if (!compiled) throw new Error('compile produced no output')
    return compiled.code
  }

  describe('extension client/server isolation', () => {
    it('server code + its node imports never reach the client bundle', async () => {
      const client = await compileClient(
        `import {readFileSync} from 'node:fs'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
const tool = defineTool({name: 'iso_tool', description: 'd', inputSchema: z.object({})})
  .server(() => readFileSync('/etc/secret-token', 'utf8'))
const iso = defineExtension({name: 'iso', Component: Surface, tools: [tool]})
  .server(() => ({systemPrompt: readFileSync('/etc/secret-token', 'utf8')}))
export default iso
function Surface() {
  return <button data-client-marker>Go</button>
}`,
      )

      expect(client).toContain('data-client-marker')

      expect(client).not.toContain('node:fs')
      expect(client).not.toContain('readFileSync')
      expect(client).not.toContain('/etc/secret-token')
    }, 30_000)
  })
})

describe('resolve extensions module', () => {
  it('resolves the extensions ids with any query or hash cut off, and nothing else', () => {
    expect(resolveExtensionsModule(EXTENSIONS_VIRTUAL_ID)).toBe(EXTENSIONS_RESOLVED_ID)
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}?v=1`)).toBe(EXTENSIONS_RESOLVED_ID)
    expect(resolveExtensionsModule(`${WIDGET_DOCK_ROUTE}#top`)).toBe(EXTENSIONS_DOCK_RESOLVED_ID)
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}?v=1#top`)).toBe(EXTENSIONS_RESOLVED_ID)
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}#top?v=1`)).toBe(EXTENSIONS_RESOLVED_ID)
    expect(resolveExtensionsModule('/src/main.tsx?v=1')).toBeNull()
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}x`)).toBeNull()
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}?${'#'.repeat(200_000)}\n`)).toBe(EXTENSIONS_RESOLVED_ID)
    expect(resolveExtensionsModule(`${WIDGET_ROUTE}?v=1\nmore`)).toBe(EXTENSIONS_RESOLVED_ID)
  })
})

describe('split declaration', () => {
  const ID = '/proj/conciv/extensions/capability.tsx'

  const CAPABILITY_ONLY = `import {readFileSync} from 'node:fs'
import {defineTool, defineAttachment} from '@conciv/extension'
import {Card} from './card.js'
import {Preview} from './preview.js'

export const draw = defineTool({name: 'draw'})
  .server(() => readFileSync('/etc/SECRET_TOKEN'))
  .render(Card)

export const shot = defineAttachment({mime: 'image/png'})
  .card(Preview)
  .server(() => ({expanded: globalThis.process.env.SECRET_TOKEN}))`

  const RECEIVERS = `import {defineExtension} from '@conciv/extension'

const view = {render: () => 'VIEW_RENDER'}
const printer = {client: () => 'PRINTER_CLIENT'}
const socket = {server: () => 'SOCKET_SERVER'}
const deck = {card: () => 'DECK_CARD'}

export const values = [view.render(), printer.client(), socket.server(), deck.card()]

export default defineExtension({name: 'plain'})
  .client(() => ({selection: 'CLIENT_BODY'}))
  .server(() => ({systemPrompt: 'SERVER_BODY'}))`

  const EXTENSION_GLOBALS = `import {defineExtension} from '@conciv/extension'

export default defineExtension({name: 'globals'})
  .client(() => ({selection: document.title + navigator.userAgent}))
  .server(() => ({systemPrompt: 'SERVER_BODY'}))`

  const CAPABILITY_GLOBALS = `import {defineAttachment} from '@conciv/extension'

export const shot = defineAttachment({mime: 'image/png'})
  .card(() => document.title + navigator.userAgent)
  .server(() => ({expanded: 'SERVER_BODY'}))`

  const REASSIGNED_RECEIVER = `import {defineTool} from '@conciv/extension'
import {foreignBuilder} from './foreign.js'

let receiver = defineTool({name: 'shifty'})
receiver = foreignBuilder

export const out = receiver.server(() => 'FOREIGN_SERVER_BODY')`

  const FOREIGN_IMPORT = `import {defineTool} from 'other-builders'
import {defineAttachment} from '@conciv/extension'

export const foreign = defineTool({name: 'foreign'}).server(() => 'FOREIGN_SERVER_BODY')

export const ours = defineAttachment({mime: 'image/png'}).server(() => ({expanded: 'OURS_SERVER_BODY'}))`

  const ALIASED_IMPORT = `import {defineTool as makeTool} from '@conciv/extension/tool'

export const aliased = makeTool({name: 'aliased'}).server(() => 'ALIAS_SERVER_BODY')`

  describe('splitExtension declaration matching', () => {
    it('processes a module that declares capabilities without declaring an extension', () => {
      const browser = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const node = splitExtension(CAPABILITY_ONLY, ID, 'node')
      expect(browser).not.toBeNull()
      expect(node).not.toBeNull()
    })

    it('browser: a capability-only module keeps its browser handlers and loses every server handler', () => {
      const out = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('node:fs')
      expect(code).not.toContain('readFileSync')
      expect(code).not.toContain('SECRET_TOKEN')
      expect(code).toContain('.render(Card)')
      expect(code).toContain('.card(Preview)')
    })

    it('node: a capability-only module keeps its server handlers and loses render and card', () => {
      const out = splitExtension(CAPABILITY_ONLY, ID, 'node')
      const code = out?.code ?? ''
      expect(code).not.toContain('.render(')
      expect(code).not.toContain('.card(')
      expect(code).not.toContain('./card.js')
      expect(code).not.toContain('./preview.js')
      expect(code).toContain('.server(')
      expect(code).toContain('node:fs')
      expect(code).toContain('SECRET_TOKEN')
    })

    it('keeps every declaration alive in both outputs', () => {
      const browser = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const node = splitExtension(CAPABILITY_ONLY, ID, 'node')
      for (const code of [browser?.code ?? '', node?.code ?? '']) {
        expect(code).toContain('defineTool(')
        expect(code).toContain("name: 'draw'")
        expect(code).toContain('defineAttachment(')
        expect(code).toContain("mime: 'image/png'")
      }
    })

    it('leaves a render, client, server or card call on an unrelated receiver untouched in both outputs', () => {
      const browser = splitExtension(RECEIVERS, ID, 'browser')
      const node = splitExtension(RECEIVERS, ID, 'node')
      for (const code of [browser?.code ?? '', node?.code ?? '']) {
        expect(code).toContain('view.render()')
        expect(code).toContain('printer.client()')
        expect(code).toContain('socket.server()')
        expect(code).toContain('deck.card()')
      }
    })

    it('leaves a terminator alone when its receiver binding is reassigned', () => {
      const out = splitExtension(REASSIGNED_RECEIVER, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).toContain('receiver.server(')
      expect(code).toContain('FOREIGN_SERVER_BODY')
    })

    it('recognizes a declaration call only when it is imported from @conciv/extension', () => {
      const out = splitExtension(FOREIGN_IMPORT, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).toContain('FOREIGN_SERVER_BODY')
      expect(code).not.toContain('OURS_SERVER_BODY')
    })

    it('follows an aliased declaration import from a @conciv/extension subpath', () => {
      const out = splitExtension(ALIASED_IMPORT, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('ALIAS_SERVER_BODY')
    })

    it('drops the handler instead of emptying it, leaving no reference to browser-only globals on the server', () => {
      for (const source of [EXTENSION_GLOBALS, CAPABILITY_GLOBALS]) {
        const out = splitExtension(source, ID, 'node')
        const code = out?.code ?? ''
        expect(code).not.toContain('document')
        expect(code).not.toContain('navigator')
        expect(code).toContain('SERVER_BODY')
      }
    })
  })
})

describe('split extension', () => {
  const ID = '/proj/conciv/extensions/canvas.tsx'

  function splitCode(out: ReturnType<typeof splitExtension>): string {
    if (out === null) throw new Error('splitExtension returned null')
    return out.code
  }

  const SOURCE = `import {readFileSync} from 'node:fs'
import {defineExtension, defineTool} from '@conciv/extension'
import {Card} from './card.js'

const draw = defineTool({name: 'draw'})
  .server((input) => readFileSync(String(input)))
  .render(Card)

export default defineExtension({name: 'canvas', tools: [draw]})
  .client(() => ({selection: CLIENT_BODY}))
  .server(() => ({systemPrompt: SERVER_BODY}))`

  const SURFACE_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({
  name: 'surface',
  Component,
  Surface,
  views: [{id: 'panel', label: 'Panel', render: Panel}],
})

export default extension

function Component() {
  return <ComposerActions.Action priority={10} />
}

function Surface() {
  return <ComposerActions.ActionButton tooltip="b" />
}

function Panel() {
  return <ComposerActions.ActionMenuItem label="c" />
}`

  const METHOD_SURFACE_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({
  name: 'method-surface',
  Component() {
    return <ComposerActions.Action priority={10} />
  },
  Surface() {
    return <ComposerActions.ActionButton tooltip="b" />
  },
})

export default extension`

  const ASSIGN_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const deploy = defineExtension({name: 'deploy'})

function DeployButton() {
  return <ComposerActions.Action priority={10} />
}

export default Object.assign(deploy, {Component: DeployButton})`

  describe('splitExtension', () => {
    it('browser: collapses .server(), keeps .client()/.render(), drops node-only imports', async () => {
      const out = splitExtension(SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('SERVER_BODY')
      expect(code).not.toContain('node:fs')
      expect(code).not.toContain('readFileSync')
      expect(code).toContain('.client(')
      expect(code).toContain('.render(Card)')
      expect(code).toContain('CLIENT_BODY')
    })

    it('node: collapses .client()/.render(), keeps .server(), drops client-only imports', async () => {
      const out = splitExtension(SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('.client(')
      expect(code).not.toContain('.render(')
      expect(code).not.toContain('CLIENT_BODY')
      expect(code).not.toContain('./card.js')
      expect(code).toContain('.server(')
      expect(code).toContain('SERVER_BODY')
      expect(code).toContain('node:fs')
    })

    it('returns null for a file that does not use defineExtension', async () => {
      const out = splitExtension(`export const x = api.server(() => 1)`, ID, 'browser')
      expect(out).toBeNull()
    })

    it('node: drops Component/Surface/views and the client-only imports they hold alive', async () => {
      const out = splitExtension(SURFACE_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('Component')
      expect(code).not.toContain('Surface')
      expect(code).not.toContain('views')
      expect(code).not.toContain('Panel')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'surface'")
    })

    it('browser: keeps Component/Surface/views intact', async () => {
      const out = splitExtension(SURFACE_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('Component')
      expect(code).toContain('Surface')
      expect(code).toContain('views')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it('node: drops an object-method Component/Surface and the client-only imports they hold alive', async () => {
      const out = splitExtension(METHOD_SURFACE_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('Component')
      expect(code).not.toContain('Surface')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'method-surface'")
    })

    it('browser: keeps an object-method Component/Surface intact', async () => {
      const out = splitExtension(METHOD_SURFACE_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('Component')
      expect(code).toContain('Surface')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it('node: strips Component from the Object.assign(extension, {Component}) form and its client-only imports', async () => {
      const out = splitExtension(ASSIGN_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('DeployButton')
      expect(code).not.toContain('Component')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'deploy'")
    })

    it('browser: keeps Component from the Object.assign(extension, {Component}) form intact', async () => {
      const out = splitExtension(ASSIGN_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('DeployButton')
      expect(code).toContain('Component')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it.each(['composer-action', 'full'] as const)(
      'node: the %s scaffold keeps no client-only package import',
      async (kind) => {
        const source = scaffold(kind, {name: 'demo'})
        expect(source).toContain('@conciv/ui-kit-chat')
        const node = splitExtension(source, ID, 'node')
        expect(node).not.toBeNull()
        expect(node!.code).not.toContain('@conciv/ui-kit-chat')
        expect(splitExtension(source, ID, 'browser')!.code).toContain('@conciv/ui-kit-chat')
      },
    )

    it('round-trips a scaffolded full extension through both sides', async () => {
      const source = scaffold('full', {name: 'demo'})
      const browser = splitExtension(source, ID, 'browser')
      const node = splitExtension(source, ID, 'node')
      expect(browser).not.toBeNull()
      expect(node).not.toBeNull()
      expect(browser!.code).not.toContain('.server(')
      expect(browser!.code).toContain('.client(')
      expect(browser!.code).toContain('.render(')
      expect(node!.code).not.toContain('.client(')
      expect(node!.code).not.toContain('.render(')
      expect(node!.code).toContain('.server(')
    })
  })
})
