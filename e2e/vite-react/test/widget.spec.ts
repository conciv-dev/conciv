import {expect, test} from '@playwright/test'
import {z} from 'zod'
import {collectFailures, expectWidgetBoots, loginWidget, trustedEngineBase} from '@conciv/e2e-utils/widget'

const CreatedSchema = z.object({json: z.object({sessionId: z.string()})})

test('widget boots from dist in a react vite app with the terminal extension its config installs', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
  await expect(chat.getByRole('tab', {name: 'Terminal'})).toBeVisible()
  const base = await trustedEngineBase(page)
  const post = async (path: string, json: unknown): Promise<unknown> =>
    (
      await fetch(`${base}/rpc/${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({json}),
      })
    ).json()
  const {sessionId} = CreatedSchema.parse(await post('sessions/create', undefined)).json
  expect(await post('ext/terminal/state', {sessionId})).toEqual({json: {alive: false, busy: false}})
})
