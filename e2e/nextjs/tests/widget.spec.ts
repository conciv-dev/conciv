import {expect, test} from '@playwright/test'
import {z} from 'zod'
import {collectFailures, expectWidgetBoots, loginWidget, trustedEngineBase} from '@conciv/e2e-utils/widget'

const CreatedSchema = z.object({json: z.object({sessionId: z.string()})})

test('widget boots from dist in a nextjs app with the terminal extension tab its config installs', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  await expect(page.getByRole('dialog', {name: 'conciv chat agent'}).getByRole('tab', {name: 'Terminal'})).toBeVisible()
})

test('the terminal server extension installed in next.config loaded and answers for a session', async ({page}) => {
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
