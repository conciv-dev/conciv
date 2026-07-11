import {componentHostAt, describe as describeHost, find, inspect, locate, override, tree} from '../src/react-bridge.js'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {createRoot, type Root} from 'react-dom/client'
import type {Refs} from '../src/page-snapshot.js'
import {FixtureApp} from './fixtures/react-app.js'

const makeRefs = (): Refs => ({map: new Map(), n: 0})

let container: HTMLElement
let root: Root

const leaf = (): Element => {
  const el = document.querySelector('[data-fixture="leaf"]')
  if (!el) throw new Error('fixture leaf not rendered')
  return el
}

const classHost = (): Element => {
  const el = document.querySelector('[data-fixture="class"]')
  if (!el) throw new Error('fixture class host not rendered')
  return el
}

beforeAll(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  root.render(<FixtureApp />)
  await vi.waitFor(() => {
    if (!document.querySelector('[data-fixture="leaf"]')) throw new Error('fixture not rendered yet')
  })
})

afterAll(() => {
  root.unmount()
  container.remove()
})

describe('locate', () => {
  it('names the component and walks the composite owner chain', async () => {
    const refs = makeRefs()
    const result = await locate(leaf(), refs)
    expect(result).not.toBeNull()
    expect(result?.stack).toContain('Leaf')
    expect(result?.stack).toContain('Branch')
    expect(result?.owners.map((owner) => owner.component)).toContain('Leaf')
    expect(result?.owners.every((owner) => owner.ref.startsWith('v') || owner.ref === '')).toBe(true)
  })

  it('reads a data-conciv-source attribute into a source location', async () => {
    leaf().setAttribute('data-conciv-source', 'src/app/leaf.tsx:12:7')
    const result = await locate(leaf(), makeRefs())
    expect(result?.source).toEqual({file: 'src/app/leaf.tsx', line: 12, column: 7})
    leaf().removeAttribute('data-conciv-source')
  })
})

describe('describe + componentHostAt', () => {
  it('resolves the owning component of a host element', () => {
    expect(describeHost(leaf()).component).toBe('Leaf')
    expect(componentHostAt(leaf())).toBe(leaf())
  })
})

describe('inspect', () => {
  it('reads function-component props and hooks', async () => {
    const result = await inspect(leaf())
    expect(result?.component).toBe('Leaf')
    expect(result?.props).toMatchObject({label: 'A'})
    expect(result?.state).toBeNull()
    expect(result?.hooks.length).toBeGreaterThan(0)
    expect(result?.rect).toMatchObject({w: expect.any(Number)})
  })

  it('reads class-component state and reports no hooks', async () => {
    const result = await inspect(classHost())
    expect(result?.component).toBe('Counter')
    expect(result?.state).toEqual({value: 5})
    expect(result?.hooks).toEqual([])
  })
})

describe('override', () => {
  it('sets class state in place and re-renders', async () => {
    const result = await override(classHost(), 'state', ['value'], 42)
    expect(result).toEqual({ok: true})
    await expect.poll(() => classHost().textContent).toBe('42')
  })

  it('overrides function-component props through the dev renderer', async () => {
    const result = await override(leaf(), 'props', ['label'], 'B')
    expect(result).toEqual({ok: true})
    await expect.poll(() => leaf().textContent).toContain('B:')
  })

  it('overrides hook state by hook id', async () => {
    const inspected = await inspect(leaf())
    const editable = inspected?.hooks.find((hook) => hook.editable)
    expect(editable).toBeDefined()
    const result = await override(leaf(), 'hooks', [], 9, editable?.id)
    expect(result).toEqual({ok: true})
    await expect.poll(() => leaf().textContent).toContain(':9:')
  })

  it('overrides the nearest context provider value', async () => {
    const result = await override(leaf(), 'context', [], 'contrast')
    expect(result).toEqual({ok: true})
    await expect.poll(() => leaf().textContent).toContain(':contrast')
  })

  it('reports actionable errors for unsupported targets', async () => {
    const hooksWithoutId = await override(leaf(), 'hooks', [], 1)
    expect(hooksWithoutId).toEqual({error: 'hooks override requires hookId (from inspect → hooks[].id)'})
    const stateOnFunction = await override(leaf(), 'state', [], {})
    expect(stateOnFunction).toEqual({
      error: 'state override targets class components; function-component state is a hook — use target=hooks',
    })
    const detached = document.createElement('div')
    document.body.appendChild(detached)
    expect(await override(detached, 'props', [], 1)).toEqual({error: 'no React fiber for element'})
    detached.remove()
  })
})

describe('tree + find', () => {
  it('builds the composite tree from a root element', async () => {
    const result = await tree(container, makeRefs())
    const names: string[] = []
    const collect = (nodes: typeof result.nodes): void => {
      for (const node of nodes) {
        names.push(node.component)
        collect(node.children)
      }
    }
    collect(result.nodes)
    expect(names).toContain('FixtureApp')
    expect(names).toContain('Branch')
    expect(names).toContain('Leaf')
    expect(names).toContain('Counter')
  })

  it('truncates beyond maxNodes and attributes the cut to an ancestor', async () => {
    const result = await tree(container, makeRefs(), {maxNodes: 1})
    expect(result.truncated).toBeGreaterThan(0)
  })

  it('finds rendered components by display name', () => {
    const refs = makeRefs()
    const result = find('Leaf', refs)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.matches[0]?.component).toBe('Leaf')
    const ref = result.matches[0]?.ref
    expect(ref ? refs.map.get(ref)?.deref() : null).toBe(leaf())
  })
})
