import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {createAnchorResolver} from '../../src/anchor/resolver.js'

const state = {root: ''}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-anchor-'))
})
afterEach(async () => {
  await rm(state.root, {recursive: true, force: true})
})

async function writeSrc(rel: string, code: string): Promise<void> {
  await mkdir(join(state.root, 'src'), {recursive: true})
  await writeFile(join(state.root, rel), code, 'utf8')
}

// col points at the '<' of the targeted JSX element on its line.
test('capture then resolve at the same place is fresh', async () => {
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /><Label>hi</Label></Row>\n)\n`)
  const r = createAnchorResolver({projectRoot: state.root})
  const anchor = await r.capture({file: 'src/App.tsx', line: 2, col: 3})
  expect(anchor.component).toBe('Row')
  const res = await r.resolve(anchor)
  expect(res.status).toBe('fresh')
})

test('a node pushed to a new line resolves as moved (content-hash relocates, no git)', async () => {
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  const r = createAnchorResolver({projectRoot: state.root})
  const anchor = await r.capture({file: 'src/App.tsx', line: 2, col: 3})
  // Insert blank lines above — the Row moves down; an uncommitted edit git could not track.
  await writeSrc('src/App.tsx', `export const A = () => (\n\n\n  <Row><Icon name="a" /></Row>\n)\n`)
  const res = await r.resolve(anchor)
  expect(res.status).toBe('moved')
  expect(res.anchor?.line).toBe(4)
})

test('duplicated identical JSX is ambiguous (never silently re-pinned)', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  // Box already lives under <div>; capture it (col 8 = the '<' of Box).
  await writeSrc('src/App.tsx', `export const A = () => (\n  <div><Box><Item key="x" /></Box></div>\n)\n`)
  const anchor = await r.capture({file: 'src/App.tsx', line: 2, col: 8})
  expect(anchor.component).toBe('Box')
  // Reformat so the stored line:col no longer holds the Box, and TWO identical Boxes now exist under
  // the same <div> parent -> step 1 fails, step 2 finds 2 hash matches -> ambiguous.
  await writeSrc(
    'src/App.tsx',
    `export const A = () => (\n  <div>\n    <Box><Item key="x" /></Box><Box><Item key="x" /></Box>\n  </div>\n)\n`,
  )
  const res = await r.resolve(anchor)
  expect(res.status).toBe('ambiguous')
  expect(res.candidates?.length).toBe(2)
})

test('a structurally changed node drifts with a before/after diff', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  const anchor = await r.capture({file: 'src/App.tsx', line: 2, col: 3})
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Button label="go" /></Row>\n)\n`)
  const res = await r.resolve(anchor)
  expect(res.status).toBe('drifted')
  expect(res.diff?.before).toContain('Icon')
})

test('a deleted file makes the anchor orphaned', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  await writeSrc('src/Gone.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  const anchor = await r.capture({file: 'src/Gone.tsx', line: 2, col: 3})
  await rm(join(state.root, 'src/Gone.tsx'))
  const res = await r.resolve(anchor)
  expect(res.status).toBe('orphaned')
})

test('identical leaves under different parents hash differently (ancestor salt)', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Header><Icon name="a" /></Header>\n)\n`)
  const inHeader = await r.capture({file: 'src/App.tsx', line: 2, col: 11})
  await writeSrc('src/B.tsx', `export const B = () => (\n  <Footer><Icon name="a" /></Footer>\n)\n`)
  const inFooter = await r.capture({file: 'src/B.tsx', line: 2, col: 11})
  expect(inHeader.component).toBe('Icon')
  expect(inFooter.component).toBe('Icon')
  expect(inHeader.hash).not.toBe(inFooter.hash)
})

test('confinement: a path escaping the project root is rejected', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  await expect(r.capture({file: '../../etc/passwd', line: 1, col: 1})).rejects.toThrow(/escapes|illegal/)
})

test('secret denylist: a .env path is rejected', async () => {
  const r = createAnchorResolver({projectRoot: state.root})
  await writeFile(join(state.root, '.env'), 'SECRET=1\n')
  await expect(r.capture({file: '.env', line: 1, col: 1})).rejects.toThrow(/secret/)
})
