import {describe, it, expect} from 'vitest'
import {scaffold} from '@conciv/extension/catalog'
import {splitExtension} from '../src/split-extension.js'

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
