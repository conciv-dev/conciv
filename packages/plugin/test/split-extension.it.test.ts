import {describe, it, expect} from 'vitest'
import {splitExtension} from '../src/core/split-extension.js'

const ID = '/proj/mandarax/extensions/canvas.tsx'

const SOURCE = `import {readFileSync} from 'node:fs'
import {defineExtension, defineTool} from '@mandarax/extension'
import {Card} from './card.js'

const draw = defineTool({name: 'draw'})
  .server((input) => readFileSync(String(input)))
  .render(Card)

export default defineExtension({name: 'canvas', tools: [draw]})
  .client(() => ({selection: CLIENT_BODY}))
  .server(() => ({systemPrompt: SERVER_BODY}))`

describe('splitExtension', () => {
  it('browser: collapses .server(), keeps .client()/.render(), drops node-only imports', async () => {
    const out = await splitExtension(SOURCE, ID, 'browser')
    expect(out).not.toBeNull()
    const code = out!.code
    expect(code).not.toContain('.server(')
    expect(code).not.toContain('SERVER_BODY')
    expect(code).not.toContain('node:fs')
    expect(code).not.toContain('readFileSync')
    expect(code).toContain('.client(')
    expect(code).toContain('.render(Card)')
    expect(code).toContain('CLIENT_BODY')
  })

  it('node: collapses .client()/.render(), keeps .server(), drops client-only imports', async () => {
    const out = await splitExtension(SOURCE, ID, 'node')
    expect(out).not.toBeNull()
    const code = out!.code
    expect(code).not.toContain('.client(')
    expect(code).not.toContain('.render(')
    expect(code).not.toContain('CLIENT_BODY')
    expect(code).not.toContain('./card.js')
    expect(code).toContain('.server(')
    expect(code).toContain('SERVER_BODY')
    expect(code).toContain('node:fs')
  })

  it('returns null for a file that does not use defineExtension', async () => {
    const out = await splitExtension(`export const x = api.server(() => 1)`, ID, 'browser')
    expect(out).toBeNull()
  })
})
