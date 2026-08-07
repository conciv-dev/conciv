import {Show, createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {Button} from '@conciv/ui-kit-system'
import {RichTextField, type RichTextFieldHandle, type RichTextFieldSelection} from './rich-text-field.js'

const FIELD_SKIN =
  'bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] focus-within:[border-color:var(--pw-accent-line)] [&[data-disabled]]:opacity-60'

function Harness(props: {initialValue?: string; placeholder?: string; disabled?: boolean; consumeFilePaste?: boolean}) {
  const [value, setValue] = createSignal(props.initialValue ?? '')
  const [submitted, setSubmitted] = createSignal('')
  const [selection, setSelection] = createSignal<RichTextFieldSelection>({start: 0, end: 0})
  const [filesPasted, setFilesPasted] = createSignal(0)
  const [handle, setHandle] = createSignal<RichTextFieldHandle | null>(null)
  return (
    <div class="p-4 flex flex-col gap-3 max-w-100">
      <RichTextField
        class={FIELD_SKIN}
        value={value()}
        onValueChange={setValue}
        onSubmit={() => {
          setSubmitted(value())
          setValue('')
        }}
        onSelectionChange={setSelection}
        placeholder={props.placeholder}
        label="Message"
        disabled={props.disabled}
        onPaste={(event) => {
          if (!props.consumeFilePaste) return false
          const files = event.clipboardData?.files ?? []
          if (files.length === 0) return false
          setFilesPasted((count) => count + 1)
          return true
        }}
        onReady={setHandle}
      />
      <output aria-label="Current value">{JSON.stringify(value())}</output>
      <output aria-label="Submitted">{JSON.stringify(submitted())}</output>
      <output aria-label="Selection">{`${selection().start}:${selection().end}`}</output>
      <output aria-label="Files pasted">{filesPasted()}</output>
      <Show when={handle()}>
        {(api) => (
          <div class="flex gap-2">
            <Button onClick={() => setValue('replaced text')}>Replace value</Button>
            <Button onClick={() => api().insertText(' inserted')}>Insert text</Button>
            <Button onClick={() => api().appendText(' appended')}>Append text</Button>
            <Button onClick={() => api().focus({end: true})}>Focus end</Button>
            <Button onClick={() => api().clear()}>Clear</Button>
          </div>
        )}
      </Show>
    </div>
  )
}

const meta: Meta<typeof Harness> = {title: 'ui-kit-tap/RichTextField', component: Harness}
export default meta
type Story = StoryObj<typeof Harness>

const valueOutput = (canvas: ReturnType<typeof within>) => canvas.getByRole('status', {name: 'Current value'})
const submittedOutput = (canvas: ReturnType<typeof within>) => canvas.getByRole('status', {name: 'Submitted'})
const textbox = (canvas: ReturnType<typeof within>) => canvas.getByRole('textbox', {name: 'Message'})
const undoModifier = () => (navigator.platform.includes('Mac') ? 'Meta' : 'Control')
const settleHistoryGroup = () => new Promise((resolve) => setTimeout(resolve, 600))

export const Empty: Story = {
  args: {placeholder: 'Message the agent…'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => textbox(canvas))
    await expect(canvas.getByText('Message the agent…')).toBeVisible()
  },
}

export const TypingAndSubmit: Story = {
  args: {placeholder: 'Message the agent…'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hello world')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hello world"'))
    await expect(canvas.getByRole('status', {name: 'Selection'})).toHaveTextContent('11:11')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(submittedOutput(canvas)).toHaveTextContent('"hello world"'))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('""'))
    await expect(canvas.getByText('Message the agent…')).toBeVisible()
  },
}

export const ShiftEnterMultiline: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'one')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await userEvent.type(editor, 'two')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"one\\ntwo"'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(submittedOutput(canvas)).toHaveTextContent('"one\\ntwo"'))
  },
}

export const Disabled: Story = {
  args: {placeholder: 'Message the agent…', disabled: true},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await expect(editor).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(editor)
    await userEvent.keyboard('nope')
    await userEvent.keyboard('{Enter}')
    await expect(valueOutput(canvas)).toHaveTextContent(/^""$/)
    await expect(submittedOutput(canvas)).toHaveTextContent(/^""$/)
    await expect(canvas.getByText('Message the agent…')).toBeVisible()
  },
}

export const PasteLowersToPlainText: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.paste('first\nsecond')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"first\\nsecond"'))
    const transfer = new DataTransfer()
    transfer.setData('text/html', '<b>&lt;div&gt;&amp;amp;&lt;/div&gt;</b>')
    transfer.setData('text/plain', '<div>&amp;</div>')
    await userEvent.paste(transfer)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"first\\nsecond<div>&amp;</div>"'))
  },
}

export const PasteFilesConsumedByHook: Story = {
  args: {consumeFilePaste: true},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    const transfer = new DataTransfer()
    transfer.items.add(new File(['payload'], 'notes.txt', {type: 'text/plain'}))
    await userEvent.paste(transfer)
    await waitFor(() => expect(canvas.getByRole('status', {name: 'Files pasted'})).toHaveTextContent('1'))
    await expect(valueOutput(canvas)).toHaveTextContent(/^""$/)
  },
}

export const UndoRedoTyping: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    const modifier = undoModifier()
    await userEvent.click(editor)
    await userEvent.type(editor, 'hello')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hello"'))
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent(/^""$/))
    await userEvent.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hello"'))
  },
}

export const ExternalReplacementResetsUndo: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    const modifier = undoModifier()
    await userEvent.click(editor)
    await userEvent.type(editor, 'draft before replace')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"draft before replace"'))
    await userEvent.click(canvas.getByRole('button', {name: 'Replace value'}))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"replaced text"'))
    await expect(within(editor).getByText('replaced text')).toBeVisible()
    await userEvent.click(editor)
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expect(valueOutput(canvas)).toHaveTextContent('"replaced text"')
    await expect(valueOutput(canvas)).not.toHaveTextContent('draft before replace')
  },
}

export const HandleInsertAppendClear: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    const modifier = undoModifier()
    await userEvent.click(editor)
    await userEvent.type(editor, 'base')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"base"'))
    await settleHistoryGroup()
    await userEvent.click(canvas.getByRole('button', {name: 'Insert text'}))
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"base inserted"'))
    await settleHistoryGroup()
    await userEvent.click(canvas.getByRole('button', {name: 'Append text'}))
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"base inserted appended"'))
    await userEvent.click(editor)
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"base inserted"'))
    await userEvent.click(canvas.getByRole('button', {name: 'Clear'}))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent(/^""$/))
  },
}

export const CompositionGuardedSubmit: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'kana')
    editor.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}))
    editor.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true, cancelable: true}),
    )
    editor.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true}))
    await expect(submittedOutput(canvas)).toHaveTextContent(/^""$/)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"kana"'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(submittedOutput(canvas)).toHaveTextContent('"kana"'))
  },
}

export const CapAndInternalScroll: Story = {
  args: {initialValue: 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await expect(within(editor).getByText('eight')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', {name: 'Focus end'}))
    await userEvent.type(editor, ' nine')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('eight nine'))
  },
}
