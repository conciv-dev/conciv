import {render} from 'solid-js/web'
import {page, userEvent} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {Dialog} from '../src/dialog.js'

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
  const content = page.getByRole('alertdialog').element()
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
