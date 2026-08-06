import {describe, it, expect} from 'vitest'
import {splitExtension} from '../src/split-extension.js'

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
