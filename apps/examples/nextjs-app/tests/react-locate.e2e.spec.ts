import {test, expect} from '@playwright/test'

// End-to-end: the widget + engine are live (instrumentation boots the engine on :41700; the
// widget probes it and subscribes to the page-bus). Driving /api/page/locate proves the full
// chain — browser fiber extraction (bippy) → engine symbolication (Turbopack disk maps) →
// source file:line. The <h1> is rendered by the Home server component → app/page.tsx.
test('locate resolves the <h1> to app/page.tsx via the engine', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open mandarax chat'})).toBeVisible({timeout: 30_000})
  const body = await page.evaluate(
    (u) => fetch(u, {credentials: 'include'}).then((r) => r.json()),
    'http://localhost:41700/api/page/locate?selector=h1',
  )
  expect(body.component).toBe('Home')
  expect(body.source.file).toContain('app/page.tsx')
  expect(body.source.line).toBe(17)
})
