import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import {ToolCard} from '../src/tools/styled/tool-card.js'
import {mountView} from './mount-view.js'

function part(state: ToolCallPart['state']): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'demo', arguments: '{}', input: {}, state}
}

const Icon = () => <span>i</span>

it('auto-opens while streaming and collapses when the stream settles', async () => {
  const [streaming, setStreaming] = createSignal(true)
  mountView(() => (
    <ToolCard
      Icon={Icon}
      title="Edited the page"
      part={part('input-complete')}
      result={undefined}
      autoOpen={streaming()}
    >
      <span>step rail</span>
    </ToolCard>
  ))

  await expect.element(page.getByText('step rail')).toBeVisible()
  setStreaming(false)
  await expect.element(page.getByText('step rail')).not.toBeVisible()
})

it('keeps the card open after settle when the user opened it', async () => {
  const [streaming, setStreaming] = createSignal(false)
  mountView(() => (
    <ToolCard Icon={Icon} title="Edited the page" part={part('complete')} result={undefined} autoOpen={streaming()}>
      <span>step rail</span>
    </ToolCard>
  ))

  await expect.element(page.getByRole('button', {name: /Edited the page/})).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', {name: /Edited the page/}).click()
  await expect.element(page.getByText('step rail')).toBeVisible()
  setStreaming(true)
  setStreaming(false)
  await expect.element(page.getByText('step rail')).toBeVisible()
})

it('keeps the card closed while streaming when the user collapsed it', async () => {
  const [streaming, setStreaming] = createSignal(true)
  mountView(() => (
    <ToolCard
      Icon={Icon}
      title="Edited the page"
      part={part('input-complete')}
      result={undefined}
      autoOpen={streaming()}
    >
      <span>step rail</span>
    </ToolCard>
  ))

  await expect.element(page.getByText('step rail')).toBeVisible()
  await page.getByRole('button', {name: /Edited the page/}).click()
  await expect.element(page.getByText('step rail')).not.toBeVisible()
  setStreaming(false)
  await expect.element(page.getByText('step rail')).not.toBeVisible()
})

it('opens for a pending approval and collapses once it resolves', async () => {
  const [state, setState] = createSignal<ToolCallPart['state']>('approval-requested')
  mountView(() => (
    <ToolCard Icon={Icon} title="Run a command" part={part(state())} result={undefined}>
      <span>approval detail</span>
    </ToolCard>
  ))

  await expect.element(page.getByText('approval detail')).toBeVisible()
  setState('complete')
  await expect.element(page.getByText('approval detail')).not.toBeVisible()
})

it('shows the collapsible state on the trigger even when a tooltip wraps it', async () => {
  mountView(() => (
    <ToolCard
      Icon={Icon}
      title="Edited the page"
      titleTooltip="what this run did"
      part={part('complete')}
      result={undefined}
    >
      <span>step rail</span>
    </ToolCard>
  ))

  const trigger = page.getByRole('button', {name: /Edited the page/})
  await expect.element(trigger).toHaveAttribute('data-state', 'closed')
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('data-state', 'open')
})
