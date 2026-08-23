import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {createClipboardCopy} from '../src/clipboard.js'
import {ClipboardCopyButton} from '../src/clipboard-copy-button.js'

const TEXT = 'npx @conciv/try --token abc123'
const RESET_MS = 400

function accept(written: string[]): (text: string) => Promise<void> {
  return (text) => {
    written.push(text)
    return Promise.resolve()
  }
}

const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))

const copyButton = () => page.getByRole('button', {name: 'Copy'})

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const throwSync = (): Promise<void> => {
  throw new Error('navigator.clipboard is unavailable in this context')
}

function Harness(props: {writeText: (text: string) => Promise<void>}) {
  const clipboard = createClipboardCopy({
    text: () => TEXT,
    resetMs: () => RESET_MS,
    writeText: (text) => props.writeText(text),
  })
  return (
    <>
      <button type="button" onClick={clipboard.copy}>
        Copy
      </button>
      <p>status {clipboard.status()}</p>
      <p role="status" aria-live="polite">
        {clipboard.announcement()}
      </p>
    </>
  )
}

async function copyOnce(writeText: (text: string) => Promise<void>): Promise<void> {
  render(() => <Harness writeText={writeText} />)
  await copyButton().click()
}

async function copyOnceWithButton(writeText: (text: string) => Promise<void>): Promise<void> {
  render(() => <ClipboardCopyButton text={TEXT} resetMs={RESET_MS} writeText={writeText} />)
  await copyButton().click()
}

it('hands the text to the clipboard and reports the copy landed', async () => {
  const written: string[] = []
  await copyOnce(accept(written))

  await expect.element(page.getByText('status copied')).toBeInTheDocument()
  expect(written).toEqual([TEXT])
})

it('falls back to idle once the copied window runs out', async () => {
  await copyOnce(accept([]))
  await expect.element(page.getByText('status copied')).toBeInTheDocument()

  await expect.element(page.getByText('status idle'), {timeout: RESET_MS * 6}).toBeInTheDocument()
})

it('reports a failure instead of pretending the copy worked when the clipboard refuses', async () => {
  await copyOnce(refuse)

  await expect.element(page.getByText('status failed')).toBeInTheDocument()
})

it('reports a failure when the clipboard write throws instead of rejecting', async () => {
  await copyOnce(throwSync)

  await expect.element(page.getByText('status failed')).toBeInTheDocument()
})

it('re-arms the copied window when the same text is copied again', async () => {
  await copyOnce(accept([]))
  await expect.element(page.getByText('status copied')).toBeInTheDocument()

  await pause(RESET_MS * 0.7)
  await copyButton().click()
  await pause(RESET_MS * 0.6)

  await expect.element(page.getByText('status copied')).toBeInTheDocument()
})

it('announces the copy through a live region so a pointer user hears it too', async () => {
  await copyOnce(accept([]))

  await expect.element(page.getByRole('status')).toHaveTextContent('Copied')
})

it('announces a refusal through the live region', async () => {
  await copyOnce(refuse)

  await expect.element(page.getByRole('status')).toHaveTextContent('Could not copy')
})

it('renames the copy button to Copied while the copy is fresh', async () => {
  const written: string[] = []
  await copyOnceWithButton(accept(written))

  await expect.element(page.getByRole('button', {name: 'Copied'})).toBeVisible()
  expect(written).toEqual([TEXT])
})

it('renames the copy button to Copy failed when the clipboard refuses', async () => {
  await copyOnceWithButton(refuse)

  await expect.element(page.getByRole('button', {name: 'Copy failed'})).toBeVisible()
})

it('announces the copy button result in its own live region', async () => {
  await copyOnceWithButton(accept([]))

  await expect.element(page.getByRole('status')).toHaveTextContent('Copied')
})

it('takes keyboard focus with a visible focus ring', async () => {
  render(() => <ClipboardCopyButton text={TEXT} resetMs={RESET_MS} writeText={accept([])} />)
  const button = copyButton()

  await userEvent.tab()

  await expect.element(button).toHaveFocus()
  expect(button.element().matches(':focus-visible')).toBe(true)
})

it('tells the caller when a copy landed so the caller can advance its own flow', async () => {
  function View() {
    const [told, setTold] = createSignal('')
    return (
      <>
        <ClipboardCopyButton
          text={TEXT}
          resetMs={RESET_MS}
          writeText={accept([])}
          onCopied={() => setTold('the caller was told')}
        />
        <p>{told()}</p>
      </>
    )
  }
  render(() => <View />)

  await copyButton().click()

  await expect.element(page.getByText('the caller was told')).toBeVisible()
})
