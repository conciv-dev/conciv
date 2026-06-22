import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createReactAnchorResolver} from '../src/anchor/resolver.js'

const run = promisify(execFile)
const git = (root: string, args: string[]): Promise<unknown> =>
  run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {cwd: root})

const APP = 'function App() {\n  return (\n    <div>\n      <Widget id="a" />\n    </div>\n  )\n}\n'
const loc = (source: string, token: string): {line: number; column: number} => {
  const idx = source.indexOf(token)
  const before = source.slice(0, idx)
  return {line: before.split('\n').length, column: idx - before.lastIndexOf('\n')}
}

const state: {root: string} = {root: ''}

beforeEach(async () => {
  state.root = realpathSync(mkdtempSync(join(tmpdir(), 'mx-resolver-')))
  await git(state.root, ['init', '-b', 'main'])
  mkdirSync(join(state.root, 'src'))
  writeFileSync(join(state.root, 'src', 'App.tsx'), APP)
  await git(state.root, ['add', '.'])
  await git(state.root, ['commit', '-m', 'first'])
})

afterEach(() => rmSync(state.root, {recursive: true, force: true}))

describe('createReactAnchorResolver (it) — real oxc + real git', () => {
  it('captures a node and resolves it fresh when nothing changed', async () => {
    const resolver = createReactAnchorResolver({root: state.root})
    const anchor = await resolver.capture({file: 'src/App.tsx', ...loc(APP, '<Widget')})
    expect(anchor.source.component).toBe('App')
    expect(await resolver.resolve(anchor)).toMatchObject({status: 'fresh'})
  })

  it('relocates a node that shifted on an uncommitted edit (content hash, not git)', async () => {
    const resolver = createReactAnchorResolver({root: state.root})
    const anchor = await resolver.capture({file: 'src/App.tsx', ...loc(APP, '<Widget')})
    writeFileSync(join(state.root, 'src', 'App.tsx'), `// pushed down\n// two\n${APP}`)
    const result = await resolver.resolve(anchor)
    expect(result.status).toBe('moved')
    expect(result.anchor?.source.line).toBe(anchor.source.line + 2)
  })

  it('returns ambiguous with candidates when the node is duplicated, never auto-picking', async () => {
    const resolver = createReactAnchorResolver({root: state.root})
    const anchor = await resolver.capture({file: 'src/App.tsx', ...loc(APP, '<Widget')})
    // Shift the node off its stored line (so it is not 'fresh') AND duplicate it: now two identical
    // nodes carry the stored hash, so the resolver must surface candidates rather than auto-pick.
    const dup = APP.replace('<Widget id="a" />', '<Widget id="a" /><Widget id="b" />')
    writeFileSync(join(state.root, 'src', 'App.tsx'), `// pad one\n// pad two\n${dup}`)
    const result = await resolver.resolve(anchor)
    expect(result.status).toBe('ambiguous')
    expect(result.candidates?.length).toBe(2)
    expect(result.anchor).toBeUndefined()
  })

  it('rejects a file that escapes the project root', async () => {
    const resolver = createReactAnchorResolver({root: state.root})
    const anchor = await resolver.capture({file: 'src/App.tsx', ...loc(APP, '<Widget')})
    const escaped = {...anchor, source: {...anchor.source, file: '../../etc/passwd'}}
    expect(await resolver.resolve(escaped)).toMatchObject({status: 'orphaned'})
  })
})
