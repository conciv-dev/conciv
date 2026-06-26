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

const reference = async (input: unknown): Promise<{found: boolean; file?: string; line?: number; column?: number}> =>
  JSON.parse(String(await callTool(state.stack.core, sessionId('elref'), 'element.reference', input)))

describe('element.reference (it) — agent targets source by name', () => {
  it('locates a component by enclosing name', async () => {
    const result = await reference({file: 'src/App.tsx', component: 'App'})
    expect(result.found).toBe(true)
    expect(result.file).toBe('src/App.tsx')
    expect(typeof result.line).toBe('number')
    expect(typeof result.column).toBe('number')
  })

  it('locates a JSX tag by name', async () => {
    expect((await reference({file: 'src/App.tsx', component: 'Widget'})).found).toBe(true)
  })

  it('reports not-found for an unknown name', async () => {
    expect((await reference({file: 'src/App.tsx', component: 'Nope'})).found).toBe(false)
  })
})
