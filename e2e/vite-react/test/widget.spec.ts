import {expect, test} from '@playwright/test'
import {makeRpcClient} from '@conciv/contract'
import {collectFailures, expectWidgetBoots, loginWidget, trustedEngineBase} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a react vite app with the built-in Terminal tab and the engine terminal for a session', async ({
  page,
}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
  const terminalTab = chat.getByRole('tab', {name: 'Terminal'})
  const client = makeRpcClient(await trustedEngineBase(page))
  const {sessionId} = await client.sessions.create()
  expect((await client.meta.models({sessionId})).harness.persistentPty).toBe(true)
  await terminalTab.click()
  await expect(chat.getByRole('button', {name: 'New terminal'})).toBeVisible()
})
