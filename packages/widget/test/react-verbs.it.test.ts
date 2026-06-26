// The React verbs (inspect / drill-down / override) driven in a REAL browser against a REAL React
// app. A tiny React fixture is bundled with esbuild (dev build → real reconciler + hooks), rendered
// into the page alongside the built widget global, and we call the widget's OWN page driver
// (window.__MANDARAX_PAGE_DRIVER__) — real bippy, real dehydrate, real fibers. No mocks, no example app.
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {buildFixture, fixturePage, drive, ready} from './it-fixture.js'

describe('react verbs (it) — real browser, real React, real driver', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  beforeAll(async () => {
    const fixtureJs = await buildFixture()
    const html = fixturePage(fixtureJs)
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Any /api/* probe 404s so the widget mounts no chrome — but the driver seam + RDT hook are
      // already live (set synchronously on bundle load, before the probe).
      if ((req.url ?? '').startsWith('/api/')) {
        res.writeHead(404)
        return res.end('{}')
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(html)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('inspect: serializes function/nested/array props as readable values (never [object Object])', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'inspect', selector: '#card'})
    expect(out.error).toBeUndefined()
    expect(out.component).toBe('Card')
    const props = out.props as Record<string, unknown>
    expect(props.label).toBe('Save')
    expect(String(props.onAction)).toMatch(/^ƒ/) // function preview, not dropped
    expect(props.tags).toEqual(['a', 'b', 'c'])
    // The whole reply must be JSON-clean — the original bug serialized props as "[object Object]".
    expect(JSON.stringify(out)).not.toContain('[object Object]')
    await page.close()
  })

  it('componentHostAt resolves the nearest component host; describe reads its name', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)
    type Bridge = {
      componentHostAt: (el: Element) => Element | null
      describe: (host: Element) => {component: string; file: string | null}
    }
    const out = await page.evaluate(() => {
      const b = (window as unknown as {__MANDARAX_REACT_BRIDGE__: Bridge}).__MANDARAX_REACT_BRIDGE__
      const leaf = document.querySelector('#card-inc')
      const host = leaf && b.componentHostAt(leaf)
      return host ? b.describe(host) : null
    })
    expect(out?.component).toBeTruthy()
    await page.close()
  })

  it('inspect: hooks tree exposes the useState value (and an editable id)', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'inspect', selector: '#card'})
    const hooks = out.hooks as Array<Record<string, unknown>>
    expect(Array.isArray(hooks)).toBe(true)
    const stateHook = hooks.find((h) => h.name === 'useState')
    expect(stateHook).toBeTruthy()
    expect(stateHook!.value).toBe(7)
    expect(stateHook!.editable).toBe(true)
    expect(typeof stateHook!.id).toBe('number')
    await page.close()
  })

  it('inspect --name: targets a component by name (no snapshot ref needed)', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'inspect', name: 'Card'})
    expect(out.error).toBeUndefined()
    expect(out.component).toBe('Card')
    expect((out.props as Record<string, unknown>).label).toBe('Save')
    await page.close()
  })

  it('inspect: includes the component’s on-screen rect', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'inspect', name: 'Card'})
    const rect = out.rect as Record<string, number> | null
    expect(rect).toBeTruthy()
    expect(typeof rect!.w).toBe('number')
    expect(typeof rect!.h).toBe('number')
    await page.close()
  })

  it('locate: returns the owner chain as refs and reads a build-injected source attribute', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'locate', name: 'Card'})
    expect(out.error).toBeUndefined()
    const owners = out.owners as Array<Record<string, unknown>>
    expect(Array.isArray(owners)).toBe(true)
    expect(owners.some((o) => o.component === 'Card')).toBe(true)
    // The fixture stamps #card with data-mandarax-source — locate reads it directly (the fast path).
    const source = out.source as Record<string, unknown> | undefined
    expect(source).toBeTruthy()
    expect(String(source!.file)).toContain('fixture.tsx')
    await page.close()
  })

  it('inspect --path: drills into a nested prop past the depth cap', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const out = await drive(page, {kind: 'inspect', selector: '#card', path: 'props.meta.nested'})
    expect(out.error).toBeUndefined()
    expect(out.value).toEqual({deep: 42})
    await page.close()
  })

  it('override hooks: changes the useState value and the DOM re-renders', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const ins = await drive(page, {kind: 'inspect', selector: '#card'})
    const hooks = ins.hooks as Array<Record<string, unknown>>
    const hookId = hooks.find((h) => h.name === 'useState')!.id as number

    const res = await drive(page, {kind: 'override', selector: '#card', target: 'hooks', hookId, json: '42'})
    expect(res.error).toBeUndefined()
    expect(res.ok).toBe(true)
    await page.waitForFunction(() => document.querySelector('#card-count')?.textContent === 'count: 42', undefined, {
      timeout: 5_000,
    })
    await page.close()
  })

  it('override props: a function-component prop reflects live', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const res = await drive(page, {
      kind: 'override',
      selector: '#card',
      target: 'props',
      path: 'label',
      json: '"Renamed"',
    })
    expect(res.error).toBeUndefined()
    await page.waitForFunction(() => document.querySelector('#card-label')?.textContent === 'Renamed', undefined, {
      timeout: 5_000,
    })
    await page.close()
  })

  it('override state: a class-component state path reflects live', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const res = await drive(page, {kind: 'override', selector: '#class-card', target: 'state', path: 'n', json: '99'})
    expect(res.error).toBeUndefined()
    await page.waitForFunction(() => document.querySelector('#class-n')?.textContent === 'n: 99', undefined, {
      timeout: 5_000,
    })
    await page.close()
  })

  it('override context: editing the nearest Provider value re-flows to the consumer', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const res = await drive(page, {kind: 'override', selector: '#context-card', target: 'context', json: '"neon"'})
    expect(res.error).toBeUndefined()
    await page.waitForFunction(
      () => document.querySelector('#context-theme')?.textContent === 'theme: neon',
      undefined,
      {
        timeout: 5_000,
      },
    )
    await page.close()
  })

  it('override context: errors clearly when there is no Provider ancestor', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const res = await drive(page, {kind: 'override', selector: '#card', target: 'context', json: '"x"'})
    expect(String(res.error)).toContain('Provider')
    await page.close()
  })

  it('track: counts a component’s re-renders and reports why', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    await drive(page, {kind: 'track', action: 'start'})
    for (let i = 0; i < 3; i++) await page.click('#card-inc')
    await page.waitForFunction(() => document.querySelector('#card-count')?.textContent === 'count: 10', undefined, {
      timeout: 5_000,
    })

    const rep = await drive(page, {kind: 'track', action: 'report', name: 'Card'})
    const comps = rep.components as Array<Record<string, unknown>>
    const card = comps.find((c) => c.component === 'Card')
    expect(card).toBeTruthy()
    expect(card!.renders).toBe(3) // start was after mount → only the 3 state updates
    expect(card!.lastReason).toBe('state/hooks/parent') // own state changed, no prop change
    await page.close()
  })

  it('tree: returns a bounded component hierarchy with a truncation count', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const t = await drive(page, {kind: 'tree', selector: '#app-root'})
    expect(Array.isArray(t.nodes)).toBe(true)
    expect(typeof t.truncated).toBe('number')
    expect(JSON.stringify(t.nodes)).toContain('Card')
    await page.close()
  })
})
