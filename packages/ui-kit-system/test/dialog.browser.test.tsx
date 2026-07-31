import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {page, userEvent} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {Dialog} from '../src/dialog.js'
import {EnvironmentProvider} from '../src/environment.js'
import {cleanupMounts, mountInShadow, mountStyled} from './dialog-harness.js'

const LAYERING = '.fixed{position:fixed}.inset-0{inset:0}'

const disposers: (() => void)[] = []
const hosts: HTMLElement[] = []

function mount(dismissable: boolean): {closes: boolean[]} {
  const style = document.createElement('style')
  style.textContent = LAYERING
  document.head.appendChild(style)
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  disposers.push(() => style.remove())
  const closes: boolean[] = []
  disposers.push(
    render(
      () => (
        <Dialog open onOpenChange={(open) => closes.push(open)} dismissable={dismissable} label="Sample dialog">
          <p>a body of text</p>
        </Dialog>
      ),
      host,
    ),
  )
  return {closes}
}

async function clickBehindTheDialog(): Promise<void> {
  const content = page.getByRole('dialog').element()
  const positioner = content.parentElement
  if (!(positioner instanceof HTMLElement)) throw new Error('the dialog rendered no layer behind it')
  const layer = positioner.getBoundingClientRect()
  const away = content.getBoundingClientRect().bottom + 40
  await userEvent.click(page.elementLocator(positioner), {
    position: {x: 8, y: Math.min(away, layer.height - 8)},
    force: true,
  })
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const host of hosts.splice(0)) host.remove()
  cleanupMounts()
})

it('lets escape close a dismissable dialog', async () => {
  const dialog = mount(true)
  await expect.element(page.getByText('a body of text')).toBeVisible()

  await userEvent.keyboard('{Escape}')
  await expect.poll(() => dialog.closes).toEqual([false])
})

it('lets a click behind the dialog close a dismissable dialog', async () => {
  const dialog = mount(true)
  await expect.element(page.getByText('a body of text')).toBeVisible()

  await clickBehindTheDialog()
  await expect.poll(() => dialog.closes).toEqual([false])
})

it('holds a non-dismissable dialog open through escape and clicks behind it', async () => {
  const dialog = mount(false)
  await expect.element(page.getByText('a body of text')).toBeVisible()

  await userEvent.keyboard('{Escape}')
  await clickBehindTheDialog()
  await expect.element(page.getByText('a body of text')).toBeVisible()
  expect(dialog.closes).toEqual([])
})

it('announces itself as a plain dialog unless the caller asks for an interrupt', async () => {
  mountStyled(() => (
    <Dialog open title="Connect a running session">
      <p>a body of text</p>
    </Dialog>
  ))

  await expect.element(page.getByRole('dialog')).toBeVisible()
})

it('announces itself as an alertdialog when the caller asks for an interrupt', async () => {
  mountStyled(() => (
    <Dialog open role="alertdialog" title="Stop this run?">
      <p>a body of text</p>
    </Dialog>
  ))

  await expect.element(page.getByRole('alertdialog')).toBeVisible()
})

it('takes its accessible name from the visible heading', async () => {
  mountStyled(() => (
    <Dialog open title="Connect a running session">
      <p>a body of text</p>
    </Dialog>
  ))

  await expect.element(page.getByRole('heading', {name: 'Connect a running session'})).toBeVisible()
  await expect.element(page.getByRole('dialog', {name: 'Connect a running session'})).toBeVisible()
})

it('paints no backdrop filter, which would force software compositing on every layer above it', async () => {
  mountStyled(() => (
    <Dialog open title="Connect a running session">
      <p>a body of text</p>
    </Dialog>
  ))
  await expect.element(page.getByText('a body of text')).toBeVisible()

  const filtered = [...document.querySelectorAll('*')].filter(
    (element) => getComputedStyle(element).backdropFilter !== 'none',
  )
  expect(filtered.map((element) => element.className)).toEqual([])
})

it('moves focus to the element the caller nominates, inside a shadow root', async () => {
  const shadow = mountInShadow((root) => (
    <EnvironmentProvider value={() => root}>
      <Dialog open title="Connect a running session" initialFocus={() => root.querySelector<HTMLElement>('.pick')}>
        <button type="button" class="pick">
          Pick this session
        </button>
        <button type="button">Cancel</button>
      </Dialog>
    </EnvironmentProvider>
  ))

  await expect.poll(() => shadow.activeElement?.textContent?.trim()).toBe('Pick this session')
})

it('gives focus back to the opener when it closes, inside a shadow root', async () => {
  const opener = document.createElement('button')
  opener.textContent = 'Open'
  document.body.appendChild(opener)
  hosts.push(opener)
  opener.focus()
  const [open, setOpen] = createSignal(true)

  const shadow = mountInShadow((root) => (
    <EnvironmentProvider value={() => root}>
      <Dialog open={open()} onOpenChange={setOpen} title="Connect a running session">
        <button type="button">Pick this session</button>
      </Dialog>
    </EnvironmentProvider>
  ))
  await expect.poll(() => shadow.activeElement?.textContent?.trim()).toBe('Pick this session')

  setOpen(false)
  await expect.poll(() => document.activeElement).toBe(opener)
})
