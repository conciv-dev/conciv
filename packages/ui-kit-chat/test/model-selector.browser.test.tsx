import 'virtual:uno.css'
import {createSignal, type JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {ModelSelector, type ModelOption} from '../src/primitives/model-selector/model-selector.js'
import {ModelSelector as StyledModelSelector} from '../src/styled/model-selector.js'
import {HARNESS_MODELS} from './model-selector-harness.js'
import {mountView} from './mount-view.js'

function Selector(): JSX.Element {
  const [value, setValue] = createSignal('claude-opus-4-8')
  return (
    <ModelSelector.Root models={HARNESS_MODELS} value={value()} onValueChange={setValue}>
      <ModelSelector.Trigger aria-label="Select model" />
      <ModelSelector.Content>
        <ModelSelector.Search />
        <ModelSelector.List />
      </ModelSelector.Content>
    </ModelSelector.Root>
  )
}

function tap(target: Element): void {
  const touch = {bubbles: true, composed: true, button: 0, pointerType: 'touch', isPrimary: true}
  target.dispatchEvent(new PointerEvent('pointerdown', touch))
  target.dispatchEvent(new PointerEvent('pointerup', touch))
  target.dispatchEvent(new PointerEvent('click', touch))
}

function tapTriggerThenTypeInTheSameTurn(text: string): void {
  const search = page.getByPlaceholder('Search models…').element()
  if (!(search instanceof HTMLInputElement)) throw new Error('Expected the model search to be an input')
  tap(page.getByRole('button', {name: 'Select model'}).element())
  search.value = text
  search.dispatchEvent(new InputEvent('input', {bubbles: true, data: text, inputType: 'insertText'}))
}

it('filters the list from keystrokes typed immediately after the trigger click', async () => {
  mountView(() => <Selector />)

  await userEvent.click(page.getByRole('button', {name: 'Select model'}))
  await userEvent.keyboard('haiku')

  await expect.element(page.getByText('Claude Haiku 4.5')).toBeVisible()
  await expect.element(page.getByText('Claude Sonnet 4.6')).not.toBeInTheDocument()
})

it('keeps a keystroke typed in the same turn as a touch tap on the trigger', async () => {
  mountView(() => <Selector />)

  tapTriggerThenTypeInTheSameTurn('haiku')

  await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).not.toBeInTheDocument()
})

function mountLateSelector(): (models: readonly ModelOption[]) => void {
  const [models, setModels] = createSignal<readonly ModelOption[]>([])
  mountView(() => (
    <ModelSelector.Root models={models()}>
      <ModelSelector.Trigger aria-label="Select model" />
      <ModelSelector.Content>
        <ModelSelector.Search />
        <ModelSelector.List />
      </ModelSelector.Content>
    </ModelSelector.Root>
  ))
  return (next) => setModels(next)
}

it('lists models that arrive after mount', async () => {
  const deliverModels = mountLateSelector()

  await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
  deliverModels(HARNESS_MODELS)
  await userEvent.click(page.getByRole('button', {name: 'Select model'}))

  await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
})

it('filters models that arrive after mount', async () => {
  const deliverModels = mountLateSelector()

  await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
  deliverModels(HARNESS_MODELS)
  await userEvent.click(page.getByRole('button', {name: 'Select model'}))
  await userEvent.keyboard('sonnet')

  await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).not.toBeInTheDocument()
})

it('hides the styled model list until the selector is opened', async () => {
  mountView(() => <StyledModelSelector models={HARNESS_MODELS} defaultValue="claude-opus-4-8" searchable />)

  await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByPlaceholder('Search models…'), {timeout: 2000}).not.toBeVisible()
  await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).not.toBeVisible()
})

it('reveals and filters the styled model list from keystrokes typed right after the trigger click', async () => {
  mountView(() => <StyledModelSelector models={HARNESS_MODELS} defaultValue="claude-opus-4-8" searchable />)

  await userEvent.click(page.getByRole('button', {name: 'Select model'}))
  await userEvent.keyboard('haiku')

  await expect.element(page.getByPlaceholder('Search models…'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).not.toBeInTheDocument()
})
