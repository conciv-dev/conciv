import {test, expect} from '@playwright/test'

// Live widget + engine. These verbs return fiber data straight from the browser bridge (no
// symbolication): tree (component hierarchy), inspect (props/hooks), find (refs by name).
const api = (path: string) => `http://localhost:41700/api/page/${path}`
const get = (page: import('@playwright/test').Page, path: string) =>
  page.evaluate((u) => fetch(u, {credentials: 'include'}).then((r) => r.json()), api(path))

async function widgetReady(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open mandarax chat'})).toBeVisible({timeout: 30_000})
}

test('tree returns a component hierarchy', async ({page}) => {
  await widgetReady(page)
  const tree = await get(page, 'tree?selector=main')
  expect(Array.isArray(tree.nodes)).toBe(true)
  expect(tree.nodes.length).toBeGreaterThan(0)
  expect(typeof tree.nodes[0].component).toBe('string')
})

test('inspect returns component + props for an element', async ({page}) => {
  await widgetReady(page)
  const out = await get(page, 'inspect?selector=h1')
  expect(out).toHaveProperty('component')
  expect(out).toHaveProperty('props')
  expect(out.error).toBeUndefined()
})

test('find returns refs by component name (a real client-tree component)', async ({page}) => {
  await widgetReady(page)
  // The page's user components are RSC (not in the client fiber tree); find resolves client
  // components. Discover a real one via tree, then look it up by name.
  const tree = await get(page, 'tree?selector=body')
  const name: string = tree.nodes?.[0]?.component
  expect(typeof name).toBe('string')
  const out = await get(page, `find?name=${encodeURIComponent(name)}`)
  expect(Array.isArray(out.matches)).toBe(true)
  expect(out.matches.length).toBeGreaterThan(0)
  expect(out.matches[0].component).toBe(name)
})
