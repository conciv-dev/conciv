import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {callTool, sessionId} from './helpers/run-tool.js'

const APP = 'function App() {\n  return (\n    <div>\n      <Widget id="a" />\n    </div>\n  )\n}\n'

const state: {stack: Stack} = {stack: undefined as never}

beforeAll(async () => {
  state.stack = await bootStack()
  mkdirSync(join(state.stack.dir, 'src'), {recursive: true})
  writeFileSync(join(state.stack.dir, 'src', 'App.tsx'), APP)
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

const call = async (session: string, name: string, input: unknown): Promise<Record<string, unknown>> =>
  JSON.parse(String(await callTool(state.stack.core, session, name, input)))

describe('anchor.resolve (it) — drift status for a comment', () => {
  it('resolves a source-linked comment against live code (not orphaned)', async () => {
    const session = sessionId('anchorlive')
    const target = await call(session, 'element.reference', {file: 'src/App.tsx', component: 'App'})
    await call(session, 'comment.create', {
      cid: 'anchor-live',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'here'}],
      anchor: {source: {file: target.file, line: target.line, column: target.column}},
      x: 0,
      y: 0,
      authorKind: 'ai',
    })
    const resolved = await call(session, 'anchor.resolve', {cid: 'anchor-live'})
    expect(resolved.status).not.toBe('orphaned')
  })

  it('reports orphaned for a floating comment with no source anchor', async () => {
    const session = sessionId('anchorfloat')
    await call(session, 'comment.create', {
      cid: 'anchor-float',
      kind: 'floating',
      parts: [{type: 'text', text: 'free'}],
      x: 1,
      y: 1,
      authorKind: 'ai',
    })
    expect((await call(session, 'anchor.resolve', {cid: 'anchor-float'})).status).toBe('orphaned')
  })

  it('reports moved after the anchored node shifts down in the file', async () => {
    const session = sessionId('anchormoved')
    const target = await call(session, 'element.reference', {file: 'src/App.tsx', component: 'App'})
    await call(session, 'comment.create', {
      cid: 'anchor-moved',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'move me'}],
      anchor: {source: {file: target.file, line: target.line, column: target.column}},
      x: 0,
      y: 0,
      authorKind: 'human',
    })
    expect((await call(session, 'anchor.resolve', {cid: 'anchor-moved'})).status).not.toBe('orphaned')
    writeFileSync(join(state.stack.dir, 'src', 'App.tsx'), `// pushed down\n// two\n${APP}`)
    expect((await call(session, 'anchor.resolve', {cid: 'anchor-moved'})).status).toBe('moved')
  })
})
