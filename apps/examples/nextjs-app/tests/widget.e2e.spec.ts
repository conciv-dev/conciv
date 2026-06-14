import {test, expect} from '@playwright/test'

// End-to-end in a real browser: the example boots `next dev`, instrumentation.ts boots the aidx
// engine, and instrumentation-client.ts mounts the widget against the pinned port. The FAB appears
// only after the widget's cross-origin probe to the engine (:41700) succeeds, so its presence
// proves the whole chain — withAidx → register → client widget → engine — works in Next.js.
test('aidx widget mounts in the Next.js app and connects to the engine', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
})

test('opening the FAB shows the chat greeting', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Open aidx chat'}).click()
  await expect(page.getByText('How can I help you today?')).toBeVisible({timeout: 30_000})
})
