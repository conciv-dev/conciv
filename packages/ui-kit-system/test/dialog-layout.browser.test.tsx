import 'virtual:uno.css'
import {For} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {Dialog} from '../src/dialog.js'
import {cleanupMounts, mountStyled} from './dialog-harness.js'

const ROWS = Array.from({length: 60}, (_, index) => `session ${index}`)
const LONG_COMMAND = `claude --resume ${'abcdefghij'.repeat(40)}`

afterEach(() => {
  cleanupMounts()
})

function scrollableAncestors(from: Element, stop: Element): Element[] {
  const chain: Element[] = []
  for (let node: Element | null = from; node !== null && node !== stop.parentElement; node = node.parentElement) {
    chain.push(node)
  }
  return chain
}

it('keeps the footer and the last row reachable when the content is taller than the viewport', async () => {
  const clicked: string[] = []
  mountStyled(() => (
    <Dialog
      open
      title="Connect a running session"
      footer={
        <button type="button" onClick={() => clicked.push('done')}>
          Done
        </button>
      }
    >
      <For each={ROWS}>{(row) => <p>{row}</p>}</For>
      <button type="button" onClick={() => clicked.push('last')}>
        Follow the last session
      </button>
    </Dialog>
  ))

  await userEvent.click(page.getByRole('button', {name: 'Follow the last session'}))
  await userEvent.click(page.getByRole('button', {name: 'Done'}))

  expect(clicked).toEqual(['last', 'done'])
})

it('scrolls a long command sideways inside the dialog instead of widening the layout', async () => {
  const host = mountStyled(() => (
    <Dialog open title="Connect a running session">
      <code>{LONG_COMMAND}</code>
    </Dialog>
  ))
  await expect.element(page.getByText(LONG_COMMAND)).toBeVisible()

  const command = host.querySelector('code')
  const content = page.getByRole('dialog').element()
  const layerBehind = content.parentElement
  if (command === null) throw new Error('the dialog rendered no command')
  if (layerBehind === null) throw new Error('the dialog rendered no layer behind it')
  const scrolled = scrollableAncestors(command, content).map((element) => {
    element.scrollLeft = 400
    return element.scrollLeft
  })
  layerBehind.scrollLeft = 400

  expect(scrolled.some((offset) => offset > 0)).toBe(true)
  expect(layerBehind.scrollLeft).toBe(0)
})
