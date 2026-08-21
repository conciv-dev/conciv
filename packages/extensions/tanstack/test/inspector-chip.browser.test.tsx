import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ComposerActions, ComposerActionsHost} from '@conciv/ui-kit-chat'
import {type ExtensionSlot} from '@conciv/extension'
import {HostApiProvider} from '@conciv/extension/host'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../src/client-sentinel.js'
import {InspectorChip} from '../src/client/inspector-chip.js'
import {tanstack} from '../src/client.js'

function mountChip(): void {
  render(() => <InspectorChip />)
}

function ExtensionSlotContent(props: {slot: ExtensionSlot}): JSX.Element {
  return (
    <HostApiProvider slot={props.slot}>
      <Show when={tanstack.Component}>{(component) => <Dynamic component={component()} />}</Show>
    </HostApiProvider>
  )
}

function mountSlot(slot: ExtensionSlot): void {
  render(() => <ExtensionSlotContent slot={slot} />)
}

test('the inspector chip stays out of the composer row', async () => {
  render(() => (
    <ComposerActionsHost maxInlineAuto={0}>
      <ComposerActions.Trigger>
        <span>more</span>
      </ComposerActions.Trigger>
      <ComposerActions.Trailing>
        <button type="button">Send</button>
      </ComposerActions.Trailing>
      <ExtensionSlotContent slot="composer" />
    </ComposerActionsHost>
  ))
  await expect.element(page.getByRole('button', {name: 'Send'})).toBeVisible()
  await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).not.toBeInTheDocument()
})

test('the inspector chip rides the status surface above the composer', async () => {
  mountSlot('status')
  await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).toBeVisible()
})

test('the composer chip is a labeled passive status indicator, not a button', async () => {
  mountChip()
  await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).toBeVisible()
  await expect.element(page.getByRole('button')).not.toBeInTheDocument()
})

test('hovering the chip opens its tooltip', async () => {
  mountChip()
  const chip = page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})
  await chip.hover()
  await expect.element(page.getByRole('tooltip')).toHaveTextContent(CONCIV_TANSTACK_CLIENT_LABEL)
})
