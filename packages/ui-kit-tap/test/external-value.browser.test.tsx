import {render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {RichTextField, type RichTextFieldSelection} from '../src/rich-text-field.js'

const LABEL = 'Message'
const CARET_LABEL = 'Caret'

function mount(initial: string): (next: string) => void {
  const [value, setValue] = createSignal(initial)
  const [selection, setSelection] = createSignal<RichTextFieldSelection>({start: 0, end: 0})
  render(() => (
    <>
      <RichTextField value={value()} onValueChange={setValue} onSelectionChange={setSelection} label={LABEL} />
      <p>{`${CARET_LABEL} ${selection().start}-${selection().end}`}</p>
    </>
  ))
  return setValue
}

const caret = (start: number, end: number) => page.getByText(`${CARET_LABEL} ${start}-${end}`)

const editable = () => page.getByRole('textbox', {name: LABEL})

async function placeCaret(offset: number): Promise<void> {
  await userEvent.click(editable())
  await userEvent.keyboard('{Home}')
  await expect.element(caret(0, 0)).toBeInTheDocument()
  await userEvent.keyboard(`{ArrowRight>${offset}}`)
  await expect.element(caret(offset, offset)).toBeInTheDocument()
}

it('keeps the caret in place when an external write changes text after it', async () => {
  const setValue = mount('hello world')
  await expect.element(editable()).toHaveTextContent('hello world')
  await placeCaret(5)

  setValue('hello world!')

  await expect.element(editable()).toHaveTextContent('hello world!')
  await expect.element(caret(5, 5)).toBeInTheDocument()

  await userEvent.keyboard('X')
  await expect.element(editable()).toHaveTextContent('helloX world!')
})

it('maps the caret through an external write that changes text before it', async () => {
  const setValue = mount('hello world')
  await expect.element(editable()).toHaveTextContent('hello world')
  await placeCaret(5)

  setValue('Xhello world')

  await expect.element(editable()).toHaveTextContent('Xhello world')
  await expect.element(caret(6, 6)).toBeInTheDocument()

  await userEvent.keyboard('Y')
  await expect.element(editable()).toHaveTextContent('XhelloY world')
})

it('restores a draft into an empty field with the caret at the end', async () => {
  const setValue = mount('')

  setValue('restored draft')

  await expect.element(editable()).toHaveTextContent('restored draft')
  await expect.element(caret(14, 14)).toBeInTheDocument()
})
