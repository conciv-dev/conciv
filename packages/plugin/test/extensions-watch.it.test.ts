import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {watchExtensionsDir} from '../src/core/extensions-watch.js'

const disposers: Array<() => Promise<void>> = []
const roots: string[] = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-watch-'))
  roots.push(root)
  return root
}

function track(dispose: () => Promise<void>): () => Promise<void> {
  disposers.push(dispose)
  return dispose
}

function extDir(root: string): string {
  return join(root, 'conciv', 'extensions')
}

function generatedFile(root: string): string {
  return join(root, '.conciv', 'extensions-client.gen.tsx')
}

function readGenerated(root: string): string {
  const path = generatedFile(root)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function stub(root: string, name: string): void {
  mkdirSync(extDir(root), {recursive: true})
  writeFileSync(join(extDir(root), name), 'export default {}')
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 25): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await sleep(intervalMs)
  }
}

const contains = (root: string, name: string): boolean => readGenerated(root).includes(`/conciv/extensions/${name}`)

async function waitReady(root: string): Promise<void> {
  await waitFor(() => existsSync(generatedFile(root)))
}

describe('watchExtensionsDir', () => {
  it('regenerates when a stub is added and again when it is removed', async () => {
    const root = makeRoot()
    mkdirSync(extDir(root), {recursive: true})
    track(watchExtensionsDir(root))
    await waitReady(root)

    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))

    rmSync(join(extDir(root), 'alpha.tsx'))
    await waitFor(() => !contains(root, 'alpha'))
  })

  it('stops regenerating after dispose', async () => {
    const root = makeRoot()
    mkdirSync(extDir(root), {recursive: true})
    const dispose = watchExtensionsDir(root)
    await waitReady(root)
    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))

    await dispose()
    const before = readGenerated(root)
    stub(root, 'beta.tsx')
    await sleep(600)
    expect(readGenerated(root)).toBe(before)
    expect(contains(root, 'beta')).toBe(false)
  })

  it('regenerates from a root with neither conciv/ nor extensions/ present', async () => {
    const root = makeRoot()
    track(watchExtensionsDir(root))
    await waitReady(root)
    mkdirSync(extDir(root), {recursive: true})
    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))
  })

  it('regenerates when conciv/ exists but extensions/ is created later', async () => {
    const root = makeRoot()
    mkdirSync(join(root, 'conciv'), {recursive: true})
    track(watchExtensionsDir(root))
    await waitReady(root)
    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))
  })

  it('regenerates through a staged conciv/ then extensions/ then stub creation', async () => {
    const root = makeRoot()
    track(watchExtensionsDir(root))
    await waitReady(root)
    mkdirSync(join(root, 'conciv'), {recursive: true})
    await sleep(200)
    mkdirSync(extDir(root), {recursive: true})
    await sleep(200)
    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))
  })

  it('regenerates after a recursive mkdir then stub', async () => {
    const root = makeRoot()
    track(watchExtensionsDir(root))
    await waitReady(root)
    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))
  })

  it('resumes after the conciv/ dir is deleted and recreated with a stub', async () => {
    const root = makeRoot()
    stub(root, 'alpha.tsx')
    track(watchExtensionsDir(root))
    await waitFor(() => contains(root, 'alpha'))

    rmSync(join(root, 'conciv'), {recursive: true, force: true})
    await waitFor(() => !contains(root, 'alpha'))
    await sleep(200)

    stub(root, 'beta.tsx')
    await waitFor(() => contains(root, 'beta'))
  })

  it('keeps exactly one live watcher when called twice for the same root', async () => {
    const root = makeRoot()
    mkdirSync(extDir(root), {recursive: true})
    const first = watchExtensionsDir(root)
    const second = watchExtensionsDir(root)
    await waitReady(root)

    stub(root, 'alpha.tsx')
    await waitFor(() => contains(root, 'alpha'))

    await second()
    const before = readGenerated(root)
    stub(root, 'beta.tsx')
    await sleep(600)
    expect(readGenerated(root)).toBe(before)
    expect(contains(root, 'beta')).toBe(false)

    await first()
  })
})
