import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {ModelSelectorView} from '../src/composer/model-selector.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const SONNET: HarnessModelInfo = {id: 'sonnet', name: 'Sonnet', group: 'Anthropic'}

type Mounted = {retries: () => number; recover: () => void}

function mountSelector(): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [models, setModels] = createSignal<HarnessModelInfo[]>([])
  const [failed, setFailed] = createSignal(true)
  const [retries, setRetries] = createSignal(0)
  const recover = () => {
    setModels([SONNET])
    setFailed(false)
  }
  const dispose = render(
    () => (
      <ModelSelectorView
        models={models()}
        value={null}
        failed={failed()}
        retrying={false}
        onRetry={() => setRetries(retries() + 1)}
        onSelect={() => {}}
      />
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {retries, recover}
}

test('a model list that failed to load offers a retry instead of vanishing', async () => {
  const mounted = mountSelector()

  await expect.element(page.getByText('Couldn’t load models')).toBeVisible()
  const retry = page.getByRole('button', {name: 'Retry loading models'})
  await expect.element(retry).toBeVisible()
  expect(page.getByRole('button', {name: 'Select model'}).elements()).toHaveLength(0)

  await retry.click()
  expect(mounted.retries()).toBe(1)

  mounted.recover()
  await expect.element(page.getByRole('button', {name: 'Select model'})).toBeVisible()
  expect(page.getByText('Couldn’t load models').elements()).toHaveLength(0)
})
