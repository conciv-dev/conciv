import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {Chip, ChipGroup, ChipRow} from '../src/tools/styled/chip.js'
import {mountView} from './mount-view.js'

it('renders a field chip showing its name and value', async () => {
  const host = mountView(() => (
    <ChipRow>
      <Chip name="role" value="textbox" />
    </ChipRow>
  ))

  await expect.element(page.getByText('role')).toBeVisible()
  await expect.element(page.getByText('textbox')).toBeVisible()
  expect(host.querySelector('dl')).not.toBeNull()
  expect(host.querySelector('dl dt')).not.toBeNull()
  expect(host.querySelector('dl dd')).not.toBeNull()
})

it('renders ChipGroup as a plain container, not a definition list', async () => {
  const host = mountView(() => (
    <ChipGroup>
      <Chip kind="pill" value="npm run build" />
    </ChipGroup>
  ))

  await expect.element(page.getByText('npm run build')).toBeVisible()
  expect(host.querySelector('dl')).toBeNull()
})

it('renders a pill chip showing its value, reachable by role, with the tooltip reachable by role when set', async () => {
  mountView(() => <Chip kind="pill" value="npm run build" tooltip="Runs the project build script" />)

  const trigger = page.getByRole('button', {name: 'npm run build'})
  await expect.element(trigger).toBeVisible()

  await userEvent.hover(trigger)
  await expect.element(page.getByRole('tooltip', {name: 'Runs the project build script'})).toBeVisible()
})

it('renders a field chip with a tooltip inside a ChipGroup, keeping the dl child model valid elsewhere, while still exposing name, value and tooltip', async () => {
  const host = mountView(() => (
    <ChipGroup>
      <Chip kind="field" name="selector" value="#submit" tooltip="The CSS selector that was matched" />
    </ChipGroup>
  ))

  const trigger = page.getByRole('button', {name: 'selector #submit'})
  await expect.element(trigger).toBeVisible()

  await userEvent.hover(trigger)
  await expect.element(page.getByRole('tooltip', {name: 'The CSS selector that was matched'})).toBeVisible()

  expect(host.querySelector('dl')).toBeNull()
  expect(host.querySelector('dt')).toBeNull()
  expect(host.querySelector('dd')).toBeNull()
})

it('gives each tone its own accessible tooltip content, distinguishing tones without relying on class names', async () => {
  mountView(() => (
    <ChipGroup>
      <Chip kind="pill" tone="neutral" value="idle" tooltip="status: neutral" />
      <Chip kind="pill" tone="accent" value="running" tooltip="status: accent" />
      <Chip kind="pill" tone="success" value="passed" tooltip="status: success" />
      <Chip kind="pill" tone="danger" value="failed" tooltip="status: danger" />
    </ChipGroup>
  ))

  const cases: Array<[string, string]> = [
    ['idle', 'status: neutral'],
    ['running', 'status: accent'],
    ['passed', 'status: success'],
    ['failed', 'status: danger'],
  ]

  for (const [value, tooltip] of cases) {
    await userEvent.hover(page.getByRole('button', {name: value}))
    await expect.element(page.getByRole('tooltip', {name: tooltip})).toBeVisible()
  }
})
