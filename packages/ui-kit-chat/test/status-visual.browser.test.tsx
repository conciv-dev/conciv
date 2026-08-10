import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {For} from 'solid-js'
import {StatusVisual} from '../src/tools/primitives/status-visual.js'
import {ErrorBlock} from '../src/tools/styled/error-block.js'
import type {ToolStatus} from '../src/tools/primitives/tool-status.js'
import {mountView} from './mount-view.js'

const STATUSES: Array<ToolStatus> = ['running', 'complete', 'error', 'approval']

it('gives each status its own accessible name in dot form, distinguishing them without relying on color', async () => {
  mountView(() => <For each={STATUSES}>{(status) => <StatusVisual status={status} form="dot" />}</For>)

  await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'complete'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'error'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'needs approval'})).toBeVisible()
})

it('gives each status its own accessible name in icon form, distinguishing them without relying on color', async () => {
  mountView(() => <For each={STATUSES}>{(status) => <StatusVisual status={status} form="icon" />}</For>)

  await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'complete'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'error'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'needs approval'})).toBeVisible()
})

it('shows the default "Error" label and the message', async () => {
  mountView(() => <ErrorBlock message="nothing on the page matches that selector" />)

  await expect.element(page.getByText('Error')).toBeVisible()
  await expect.element(page.getByText('nothing on the page matches that selector')).toBeVisible()
})

it('shows a custom label in place of "Error"', async () => {
  mountView(() => <ErrorBlock label="Failure" message="the sandbox blew up" />)

  await expect.element(page.getByText('Failure')).toBeVisible()
  await expect.element(page.getByText('the sandbox blew up')).toBeVisible()
})
