import 'virtual:uno.css'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {createSignal, For} from 'solid-js'
import {expect, it} from 'vitest'
import {SegmentGroup} from '../src/segment-group.js'

const SCHEMES = ['Auto', 'Light', 'Dark']

function mount(options: {defaultValue?: string; disabled?: string} = {}): () => string | null {
  const [value, setValue] = createSignal<string | null>(options.defaultValue ?? null)
  render(() => (
    <SegmentGroup.Root
      value={value() ?? undefined}
      onValueChange={(details) => setValue(details.value)}
      aria-label="Colour scheme"
    >
      <SegmentGroup.Indicator />
      <For each={SCHEMES}>
        {(scheme) => (
          <SegmentGroup.Item value={scheme} disabled={scheme === options.disabled}>
            <SegmentGroup.ItemText>{scheme}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  ))
  return value
}

function segmentOf(name: string) {
  return page.getByText(name, {exact: true})
}

function indicatorOf(): HTMLElement {
  const indicator = document.querySelector('[data-scope="segment-group"][data-part="indicator"]')
  if (!(indicator instanceof HTMLElement)) throw new Error('the segment group rendered no indicator')
  return indicator
}

it('exposes the segments as one radio group with an accessible name', async () => {
  mount({defaultValue: 'Auto'})

  await expect.element(page.getByRole('radiogroup', {name: 'Colour scheme'})).toBeVisible()
  await expect.element(page.getByRole('radio', {name: 'Auto'})).toBeChecked()
  await expect.element(page.getByRole('radio', {name: 'Dark'})).not.toBeChecked()
})

it('moves the selection to the segment the reader clicks', async () => {
  const value = mount({defaultValue: 'Auto'})

  await segmentOf('Dark').click()

  await expect.element(page.getByRole('radio', {name: 'Dark'})).toBeChecked()
  await expect.element(page.getByRole('radio', {name: 'Auto'})).not.toBeChecked()
  expect(value()).toBe('Dark')
})

it('walks the selection along the group with the arrow keys', async () => {
  const value = mount({defaultValue: 'Auto'})

  await userEvent.tab()
  await expect.element(page.getByRole('radio', {name: 'Auto'})).toHaveFocus()

  await userEvent.keyboard('{ArrowRight}')

  await expect.element(page.getByRole('radio', {name: 'Light'})).toBeChecked()
  await expect.element(page.getByRole('radio', {name: 'Light'})).toHaveFocus()
  expect(value()).toBe('Light')
})

it('refuses a disabled segment', async () => {
  const value = mount({defaultValue: 'Auto', disabled: 'Dark'})

  await expect.element(page.getByRole('radio', {name: 'Dark'})).toBeDisabled()

  await segmentOf('Light').click()

  await expect.element(page.getByRole('radio', {name: 'Light'})).toBeChecked()
  expect(value()).toBe('Light')
})

it('withholds the indicator until a segment is selected', async () => {
  mount()

  await expect.element(page.getByRole('radiogroup', {name: 'Colour scheme'})).toBeVisible()
  expect(indicatorOf().hidden).toBe(true)

  await segmentOf('Light').click()

  await expect.element(page.getByRole('radio', {name: 'Light'})).toBeChecked()
  expect(indicatorOf().hidden).toBe(false)
})
