import 'virtual:uno.css'
import {expect, it, vi} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ActionRow, ActionButton} from '../src/tools/styled/action-row.js'
import {mountView} from './mount-view.js'

it('renders allow and deny buttons reachable by role and name', async () => {
  mountView(() => (
    <ActionRow>
      <ActionButton intent="deny">Deny</ActionButton>
      <ActionButton intent="allow">Allow</ActionButton>
    </ActionRow>
  ))

  await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Allow'})).toBeVisible()
})

it('fires onClick for a neutral action button', async () => {
  const onClick = vi.fn()
  mountView(() => <ActionButton onClick={onClick}>Retry</ActionButton>)

  await userEvent.click(page.getByRole('button', {name: 'Retry'}))

  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()
  expect(onClick).toHaveBeenCalledTimes(1)
})

it('respects disabled and does not fire onClick when clicked', async () => {
  const onClick = vi.fn()
  mountView(() => (
    <ActionButton intent="allow" disabled onClick={onClick}>
      Allow
    </ActionButton>
  ))

  const button = page.getByRole('button', {name: 'Allow'})
  await expect.element(button).toBeDisabled()

  await expect(userEvent.click(button, {timeout: 500})).rejects.toThrow()

  await expect.element(button).toBeDisabled()
  expect(onClick).not.toHaveBeenCalled()
})
