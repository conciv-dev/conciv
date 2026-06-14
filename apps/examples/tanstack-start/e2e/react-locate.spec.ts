import {test, expect} from '@playwright/test'

// Cross-framework proof: the SAME browser bridge + engine symbolicator, now over Vite http
// source maps. The engine port is dynamic here (get-port), so read the base the widget was
// given. Vite resolves to the correct file; line is coarse (the ?tsr-split virtual module),
// so assert the file, not the exact line.
test('locate resolves the TanStack <h1> to src/routes/index.tsx', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
  // Fibers attach only after hydration.
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll('*')) {
        if (Object.keys(el).some((k) => k.startsWith('__reactFiber'))) return true
      }
      return false
    },
    null,
    {timeout: 15_000},
  )
  const body = await page.evaluate(async () => {
    const w = window as unknown as {__AIDX_API_BASE__?: string}
    const base = w.__AIDX_API_BASE__ ?? document.querySelector('meta[name=pw-api-base]')?.getAttribute('content') ?? ''
    const r = await fetch(`${base}/api/page/locate?selector=h1`, {credentials: 'include'})
    return r.json()
  })
  expect(body.component).toBe('App')
  expect(body.source.file).toContain('index.tsx')
})
