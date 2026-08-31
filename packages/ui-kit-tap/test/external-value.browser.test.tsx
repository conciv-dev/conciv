import {render} from '@solidjs/testing-library'
import {Show, createSignal} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {
  RichTextField,
  type RichTextFieldHandle,
  type RichTextFieldSelection,
  type RichTextFieldTriggerSource,
} from '../src/rich-text-field.js'

const LABEL = 'Message'
const CARET_LABEL = 'Caret'
const FOCUS_END = 'Focus end'

const slashTrigger: RichTextFieldTriggerSource = {
  label: 'Slash commands',
  items: () => [{id: 'clear', label: '/clear'}],
}

function mount(initial: string, triggers?: {slash: RichTextFieldTriggerSource}): (next: string) => void {
  const [value, setValue] = createSignal(initial)
  const [selection, setSelection] = createSignal<RichTextFieldSelection>({start: 0, end: 0})
  const [handle, setHandle] = createSignal<RichTextFieldHandle | null>(null)
  render(() => (
    <>
      <RichTextField
        value={value()}
        onValueChange={setValue}
        onSelectionChange={setSelection}
        onReady={setHandle}
        slashTrigger={triggers?.slash}
        label={LABEL}
      />
      <p>{`${CARET_LABEL} ${selection().start}-${selection().end}`}</p>
      <Show when={handle()}>
        {(api) => (
          <button type="button" onClick={() => api().focus({end: true})}>
            {FOCUS_END}
          </button>
        )}
      </Show>
    </>
  ))
  return setValue
}

const caret = (start: number, end: number) => page.getByText(`${CARET_LABEL} ${start}-${end}`)

const editable = () => page.getByRole('textbox', {name: LABEL})

const undoChord = navigator.platform.includes('Mac') ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}'

async function placeCaret(offset: number): Promise<void> {
  await userEvent.click(editable())
  await expect.element(editable()).toHaveFocus()
  await userEvent.keyboard('{Home}')
  await expect.element(caret(0, 0)).toBeInTheDocument()
  await userEvent.keyboard(`{ArrowRight>${offset}}`)
  await expect.element(caret(offset, offset)).toBeInTheDocument()
}

async function insertChip(): Promise<void> {
  await userEvent.click(editable())
  await expect.element(editable()).toHaveFocus()
  await userEvent.keyboard('/')
  await expect.element(page.getByRole('option', {name: '/clear'})).toBeVisible()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText('/clear')).toBeVisible()
  await expect.element(caret(7, 7)).toBeInTheDocument()
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
  const editor = editable()

  setValue('restored draft')

  await expect.element(editor).toHaveTextContent('restored draft')
  await expect.element(caret(14, 14)).toBeInTheDocument()
})

it('flattens a chip the external write spans into plain text', async () => {
  const setValue = mount('', {slash: slashTrigger})
  await insertChip()

  setValue('@ai:opus')

  await expect.element(editable()).toHaveTextContent('@ai:opus')
  await expect.element(page.getByText('/clear')).not.toBeInTheDocument()
})

it('leaves an externally written value alone when the user undoes', async () => {
  const setValue = mount('', {slash: slashTrigger})
  await insertChip()

  setValue('@ai:opus')
  await expect.element(editable()).toHaveTextContent('@ai:opus')

  await userEvent.click(page.getByRole('button', {name: FOCUS_END}))
  await expect.element(editable()).toHaveFocus()
  await expect.element(caret(8, 8)).toBeInTheDocument()
  await userEvent.keyboard(undoChord)
  await userEvent.keyboard('{Backspace}')

  await expect.element(editable()).toHaveTextContent('@ai:opu')
})
