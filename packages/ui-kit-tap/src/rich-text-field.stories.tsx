import {Show, createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {Button} from '@conciv/ui-kit-system'
import {
  RichTextField,
  type RichTextFieldHandle,
  type RichTextFieldItem,
  type RichTextFieldSelection,
  type RichTextFieldTrigger,
} from './rich-text-field.js'

const COMMANDS: RichTextFieldItem[] = [
  {id: 'help', label: '/help'},
  {id: 'clear', label: '/clear'},
  {id: 'compact', label: '/compact'},
]
const MENTIONS: RichTextFieldItem[] = [
  {id: 'ai:Opus', label: 'Opus'},
  {id: 'ai:Sonnet', label: 'Sonnet'},
  {id: 'dev', label: 'You'},
]

const matches = (item: RichTextFieldItem, query: string): boolean =>
  item.label.replaceAll('/', '').toLowerCase().includes(query.toLowerCase())

const syncTriggers: RichTextFieldTrigger[] = [
  {char: '/', label: 'Commands', items: (query) => COMMANDS.filter((item) => matches(item, query))},
  {char: '@', label: 'Mentions', items: (query) => MENTIONS.filter((item) => matches(item, query))},
]

const asyncTriggers: RichTextFieldTrigger[] = [
  {
    char: '/',
    label: 'Commands',
    items: async (query) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (query.startsWith('boom')) throw new Error('source failed')
      return COMMANDS.filter((item) => matches(item, query))
    },
  },
]

function Harness(props: {
  initialValue?: string
  placeholder?: string
  disabled?: boolean
  triggers?: RichTextFieldTrigger[]
  consumeFilePaste?: boolean
}) {
  const [value, setValue] = createSignal(props.initialValue ?? '')
  const [submitted, setSubmitted] = createSignal('')
  const [selection, setSelection] = createSignal<RichTextFieldSelection>({start: 0, end: 0})
  const [filesPasted, setFilesPasted] = createSignal(0)
  const [handle, setHandle] = createSignal<RichTextFieldHandle | null>(null)
  return (
    <div class="p-4 flex flex-col gap-3 max-w-100">
      <RichTextField
        value={value()}
        onValueChange={setValue}
        onSubmit={() => {
          setSubmitted(value())
          setValue('')
        }}
        onSelectionChange={setSelection}
        triggers={props.triggers}
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
          </div>
        )}
      </Show>
    </div>
  )
}

const meta: Meta<typeof Harness> = {title: 'ui-kit-tap/RichTextField', component: Harness}
export default meta
type Story = StoryObj<typeof Harness>

const settleHistoryGroup = () => new Promise((resolve) => setTimeout(resolve, 600))

const valueOutput = (canvas: ReturnType<typeof within>) => canvas.getByRole('status', {name: 'Current value'})
const submittedOutput = (canvas: ReturnType<typeof within>) => canvas.getByRole('status', {name: 'Submitted'})
const textbox = (canvas: ReturnType<typeof within>) => canvas.getByRole('textbox', {name: 'Message'})

export const Empty: Story = {
  args: {placeholder: 'Message the agent…'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await expect(editor).toHaveAttribute('aria-expanded', 'false')
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
    await expect(editor).toHaveAttribute('contenteditable', 'false')
    await userEvent.click(editor)
    await userEvent.keyboard('nope')
    await expect(valueOutput(canvas)).toHaveTextContent('""')
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
    await expect(valueOutput(canvas)).toHaveTextContent('""')
  },
}

export const SlashTriggerKeyboardFlow: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, '/c')
    const listbox = await waitFor(() => canvas.getByRole('listbox', {name: 'Commands'}))
    await expect(editor).toHaveAttribute('aria-expanded', 'true')
    await expect(editor).toHaveAttribute('aria-controls', listbox.id)
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible()
    await expect(canvas.queryByRole('option', {name: '/help'})).toBeNull()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => {
      const active = canvas.getByRole('option', {name: '/compact'})
      expect(active).toHaveAttribute('aria-selected', 'true')
      expect(editor).toHaveAttribute('aria-activedescendant', active.id)
    })
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"/compact "'))
    await expect(within(editor).getByText('/compact')).toBeVisible()
    await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'false'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(submittedOutput(canvas)).toHaveTextContent('"/compact "'))
  },
}

export const SlashTriggerEscapeDismisses: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, '/he')
    await waitFor(() => expect(canvas.getByRole('listbox', {name: 'Commands'})).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox', {name: 'Commands'})).toBeNull())
    await expect(editor).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(editor, 'llo')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"/hello"'))
    await expect(canvas.queryByRole('listbox', {name: 'Commands'})).toBeNull()
  },
}

export const MentionTriggerChip: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @op')
    const option = await waitFor(() => canvas.getByRole('option', {name: 'Opus'}))
    await userEvent.click(option)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await expect(within(editor).getByText('@Opus')).toBeVisible()
  },
}

export const AsyncSourceStates: Story = {
  args: {triggers: asyncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, '/')
    await waitFor(() => expect(canvas.getByText('Loading…')).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('option', {name: '/help'})).toBeVisible(), {timeout: 2000})
    await userEvent.type(editor, 'zzz')
    await waitFor(() => expect(canvas.getByText('No results')).toBeVisible(), {timeout: 2000})
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}')
    await userEvent.type(editor, 'boom')
    await waitFor(() => expect(canvas.getByRole('alert')).toBeVisible(), {timeout: 2000})
  },
}

export const AtomicChipDeletion: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @op')
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Opus'})))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await userEvent.keyboard('{Backspace}{Backspace}')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi "'))
    await expect(within(editor).queryByText('@Opus')).toBeNull()
    await userEvent.type(editor, '@so')
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Sonnet'})))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Sonnet "'))
    const leadingText = editor.firstChild?.firstChild
    if (leadingText) window.getSelection()?.collapse(leadingText, 3)
    await waitFor(() => expect(canvas.getByRole('status', {name: 'Selection'})).toHaveTextContent('3:3'))
    await userEvent.keyboard('{Delete}')
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"hi  "'))
    await expect(within(editor).queryByText('@Sonnet')).toBeNull()
  },
}

export const RangeCutAcrossChips: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'start @op')
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Opus'})))
    await userEvent.type(editor, 'end')
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"start @ai:Opus end"'))
    const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
    await userEvent.keyboard(`{${modifier}>}a{/${modifier}}{Backspace}`)
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('""'))
    await expect(within(editor).queryByText('@Opus')).toBeNull()
  },
}

export const UndoRedoSingleStepChips: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @op')
    await settleHistoryGroup()
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Opus'})))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @op"'))
    await expect(within(editor).queryByText('@Opus')).toBeNull()
    await userEvent.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`)
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await expect(within(editor).getByText('@Opus')).toBeVisible()
  },
}

export const ExternalReplacementResetsUndo: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    const modifier = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @op')
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Opus'})))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await userEvent.click(canvas.getByRole('button', {name: 'Replace value'}))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"replaced text"'))
    await expect(within(editor).queryByText('@Opus')).toBeNull()
    await userEvent.click(editor)
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expect(valueOutput(canvas)).not.toHaveTextContent('ai:Opus')
    await expect(valueOutput(canvas)).toHaveTextContent('replaced text')
    await expect(within(editor).queryByText('@Opus')).toBeNull()
  },
}

export const HandleInsertPreservesChips: Story = {
  args: {triggers: syncTriggers},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const editor = await waitFor(() => textbox(canvas))
    await userEvent.click(editor)
    await userEvent.type(editor, 'hi @op')
    await userEvent.click(await waitFor(() => canvas.getByRole('option', {name: 'Opus'})))
    await waitFor(() => expect(valueOutput(canvas)).toHaveTextContent('"hi @ai:Opus "'))
    await userEvent.click(canvas.getByRole('button', {name: 'Insert text'}))
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"hi @ai:Opus  inserted"'))
    await expect(within(editor).getByText('@Opus')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', {name: 'Append text'}))
    await waitFor(() => expect(valueOutput(canvas).textContent).toBe('"hi @ai:Opus  inserted appended"'))
    await expect(within(editor).getByText('@Opus')).toBeVisible()
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
