import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {mountView} from './mount-view.js'

const STDOUT = 'Test Files  3 passed (3)\n     Tests  17 passed (17)'
const STDERR = 'error TS2345: Argument of type string is not assignable to parameter of type number'

it('names a normal output frame as output and an error frame as error output', async () => {
  mountView(() => (
    <>
      <TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>
      <TraceOutputBlock tone="error" text={STDERR}>
        {STDERR}
      </TraceOutputBlock>
    </>
  ))

  await expect.element(page.getByRole('group', {name: 'Output', exact: true})).toBeVisible()
  await expect.element(page.getByRole('group', {name: 'Error output', exact: true})).toBeVisible()
  await expect.element(page.getByText(STDERR)).toBeVisible()
})

it('copies the block text and announces that it landed on the clipboard', async () => {
  const written: string[] = []
  const record = (text: string): Promise<void> => {
    written.push(text)
    return Promise.resolve()
  }
  mountView(() => (
    <TraceOutputBlock text={STDOUT} writeText={record}>
      {STDOUT}
    </TraceOutputBlock>
  ))

  await page.getByRole('button', {name: 'Copy'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Copied')
  expect(written).toEqual([STDOUT])
})

it('announces a clipboard refusal instead of pretending the copy worked', async () => {
  const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))
  mountView(() => (
    <TraceOutputBlock text={STDOUT} writeText={refuse}>
      {STDOUT}
    </TraceOutputBlock>
  ))

  await page.getByRole('button', {name: 'Copy'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Could not copy')
})

it('announces a clipboard refusal when writeText throws synchronously instead of returning a rejected promise', async () => {
  const throwSync = (): Promise<void> => {
    throw new Error('navigator.clipboard is unavailable in this context')
  }
  mountView(() => (
    <TraceOutputBlock text={STDOUT} writeText={throwSync}>
      {STDOUT}
    </TraceOutputBlock>
  ))

  await page.getByRole('button', {name: 'Copy'}).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Could not copy')
})

it('reaches the block actions with the keyboard', async () => {
  mountView(() => <TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>)

  await userEvent.tab()

  await expect.element(page.getByRole('button', {name: 'Copy'})).toHaveFocus()
})

it('runs the open action the block was given', async () => {
  function View() {
    const [opened, setOpened] = createSignal('')
    return (
      <>
        <TraceOutputBlock text={STDOUT} onOpen={() => setOpened('opened the full log')}>
          {STDOUT}
        </TraceOutputBlock>
        <p>{opened()}</p>
      </>
    )
  }
  mountView(() => <View />)

  await page.getByRole('button', {name: 'Open'}).click()

  await expect.element(page.getByText('opened the full log')).toBeVisible()
})

it('leaves the open action out when the block has nothing to open', async () => {
  mountView(() => <TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>)

  await expect.element(page.getByRole('button', {name: 'Copy'})).toBeVisible()
  expect(document.querySelectorAll('button')).toHaveLength(1)
})
