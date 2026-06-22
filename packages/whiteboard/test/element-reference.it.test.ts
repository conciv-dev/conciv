import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'

const APP = 'function App() {\n  return (\n    <div>\n      <Widget id="a" />\n    </div>\n  )\n}\n'

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
  mkdirSync(join(state.stack.dir, 'src'), {recursive: true})
  writeFileSync(join(state.stack.dir, 'src', 'App.tsx'), APP)
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

const reference = async (core: string, sid: string, input: unknown): Promise<Record<string, unknown>> => {
  const res = await runTool(core, sid, 'element.reference', input)
  return ((await res.json()) as {result: Record<string, unknown>}).result
}

describe('element.reference (it) — AI targets source by name', () => {
  it('locates a component by enclosing name', async () => {
    const r = await reference(state.stack!.core, sessionId('elref'), {file: 'src/App.tsx', component: 'App'})
    expect(r).toMatchObject({found: true, file: 'src/App.tsx'})
    expect(typeof r.line).toBe('number')
    expect(typeof r.column).toBe('number')
  })

  it('locates a JSX tag by name', async () => {
    const r = await reference(state.stack!.core, sessionId('elref'), {file: 'src/App.tsx', component: 'Widget'})
    expect(r.found).toBe(true)
  })

  it('reports not-found for an unknown name', async () => {
    const r = await reference(state.stack!.core, sessionId('elref'), {file: 'src/App.tsx', component: 'Nope'})
    expect(r.found).toBe(false)
  })

  it('refuses a file that escapes the project root', async () => {
    const r = await reference(state.stack!.core, sessionId('elref'), {file: '../../etc/passwd', component: 'x'})
    expect(r.found).toBe(false)
  })
})
