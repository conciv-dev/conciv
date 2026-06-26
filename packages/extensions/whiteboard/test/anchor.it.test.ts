import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'

const APP = 'function App() {\n  return (\n    <div>\n      <Widget id="a" />\n    </div>\n  )\n}\n'
const loc = (source: string, token: string): {line: number; column: number} => {
  const idx = source.indexOf(token)
  const before = source.slice(0, idx)
  return {line: before.split('\n').length, column: idx - before.lastIndexOf('\n')}
}

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
  mkdirSync(join(state.stack.dir, 'src'), {recursive: true})
  writeFileSync(join(state.stack.dir, 'src', 'App.tsx'), APP)
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

const resolveStatus = async (core: string, sid: string, cid: string): Promise<string> => {
  const res = await runTool(core, sid, 'anchor.resolve', {cid})
  return ((await res.json()) as {result: {status: string}}).result.status
}

describe('anchor.resolve (it) — real oxc over the booted stack', () => {
  it('captures a source anchor on create, resolves fresh, then moved after the node shifts', async () => {
    const stack = state.stack!
    const sid = sessionId('anchor')
    const cid = crypto.randomUUID()
    const {line, column} = loc(APP, '<Widget')

    expect(
      (
        await runTool(stack.core, sid, 'comment.create', {
          cid,
          kind: 'source-linked',
          parts: [{type: 'text', text: 'anchor me'}],
          anchor: {source: {file: 'src/App.tsx', line, column}},
          x: 10,
          y: 20,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)

    expect(await resolveStatus(stack.core, sid, cid)).toBe('fresh')

    writeFileSync(join(stack.dir, 'src', 'App.tsx'), `// pushed down\n// two\n${APP}`)
    expect(await resolveStatus(stack.core, sid, cid)).toBe('moved')
  })
})
