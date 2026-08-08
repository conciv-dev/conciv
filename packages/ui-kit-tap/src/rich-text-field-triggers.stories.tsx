import {For, Show, createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {Button} from '@conciv/ui-kit-system'
import {
  RichTextField,
  type RichTextFieldHandle,
  type RichTextFieldSelection,
  type RichTextFieldTriggerItem,
  type RichTextFieldTriggerSource,
} from './rich-text-field.js'

const COMMANDS: RichTextFieldTriggerItem[] = [
  {id: 'clear', label: '/clear'},
  {id: 'compact', label: '/compact'},
  {id: 'help', label: '/help'},
]
const PEOPLE: RichTextFieldTriggerItem[] = [
  {id: 'ai:opus', label: '@Opus'},
  {id: 'ai:sonnet', label: '@Sonnet'},
  {id: 'ai:haiku', label: '@Haiku'},
]

const LONG_COMMANDS: RichTextFieldTriggerItem[] = Array.from({length: 40}, (_unused, position) => {
  const name = `command-${String(position).padStart(2, '0')}`
  return {id: name, label: `/${name}`}
})

type Mode = 'sync' | 'delayed' | 'empty' | 'error' | 'manual' | 'long'
type PendingFetch = {query: string; resolve: (items: RichTextFieldTriggerItem[]) => void}
type ModeItems = (
  pool: RichTextFieldTriggerItem[],
  query: string,
  enqueue: (entry: PendingFetch) => void,
) => RichTextFieldTriggerItem[] | Promise<RichTextFieldTriggerItem[]>

const filterItems = (pool: RichTextFieldTriggerItem[], query: string): RichTextFieldTriggerItem[] =>
  pool.filter((item) => item.id.toLowerCase().includes(query.toLowerCase()))

const resolveAfter = (items: RichTextFieldTriggerItem[], delay: number): Promise<RichTextFieldTriggerItem[]> =>
  new Promise((resolve) => setTimeout(() => resolve(items), delay))

const sourceModes: Record<Mode, ModeItems> = {
  sync: (pool, query) => filterItems(pool, query),
  delayed: (pool, query) => resolveAfter(filterItems(pool, query), 400),
  empty: () => [],
  error: () => Promise.reject(new Error('source failed')),
  manual: (pool, query, enqueue) => new Promise((resolve) => enqueue({query, resolve})),
  long: (_pool, query) => filterItems(LONG_COMMANDS, query),
}

function triggerSource(
  mode: () => Mode,
  label: string,
  pool: RichTextFieldTriggerItem[],
  enqueue: (entry: PendingFetch) => void,
): RichTextFieldTriggerSource {
  return {label, items: (query) => sourceModes[mode()](pool, query, enqueue)}
}

function TriggerHarness(props: {mode?: Mode}) {
  const [value, setValue] = createSignal('')
  const [submitted, setSubmitted] = createSignal('')
  const [pending, setPending] = createSignal<PendingFetch[]>([])
  const [handle, setHandle] = createSignal<RichTextFieldHandle | null>(null)
  const [selection, setSelection] = createSignal<RichTextFieldSelection>({start: 0, end: 0})
  const mode = () => props.mode ?? 'sync'
  const enqueue = (entry: PendingFetch) => setPending((list) => [...list, entry])
  const settle = (entry: PendingFetch) => {
    entry.resolve(filterItems(COMMANDS, entry.query))
    setPending((list) => list.filter((candidate) => candidate !== entry))
  }
  return (
    <div class="p-4 flex flex-col gap-3 max-w-100">
      <RichTextField
        class="text-[0.8125rem] text-pw-text rounded-pw-md bg-pw-sunken [border:1px_solid_var(--pw-line)] [&[data-disabled]]:opacity-60 focus-within:[border-color:var(--pw-accent-line)]"
        value={value()}
        onValueChange={setValue}
        onSubmit={() => {
          setSubmitted(value())
          setValue('')
        }}
        label="Message"
        onSelectionChange={setSelection}
        slashTrigger={triggerSource(mode, 'Slash commands', COMMANDS, enqueue)}
        mentionTrigger={triggerSource(mode, 'Mention a participant', PEOPLE, enqueue)}
        onReady={setHandle}
      />
      <output aria-label="Current value">{JSON.stringify(value())}</output>
      <output aria-label="Submitted">{JSON.stringify(submitted())}</output>
      <output aria-label="Selection">{`${selection().start}:${selection().end}`}</output>
      <Show when={handle()}>
        {(api) => (
          <div class="flex flex-wrap gap-2">
            <Button onClick={() => setValue('@ai:opus')}>Replace with directive</Button>
            <Button onClick={() => api().insertText(' inserted')}>Insert text</Button>
            <Button onClick={() => api().focus({end: true})}>Focus end</Button>
          </div>
        )}
      </Show>
      <div class="flex flex-wrap gap-2">
        <For each={pending()}>
          {(entry) => (
            <Button onClick={() => settle(entry)}>{`Resolve ${entry.query === '' ? 'root' : entry.query}`}</Button>
          )}
        </For>
      </div>
    </div>
  )
}

const meta: Meta<typeof TriggerHarness> = {title: 'ui-kit-tap/RichTextFieldTriggers', component: TriggerHarness}
export default meta
type Story = StoryObj<typeof TriggerHarness>

type Canvas = ReturnType<typeof within>

const valueOutput = (canvas: Canvas) => canvas.getByRole('status', {name: 'Current value'})
const textbox = (canvas: Canvas) => canvas.getByRole('textbox', {name: 'Message'})
const undoModifier = () => (navigator.platform.includes('Mac') ? 'Meta' : 'Control')
const settleHistoryGroup = () => new Promise((resolve) => setTimeout(resolve, 600))

const expectValue = (canvas: Canvas, expected: string) =>
  waitFor(() => expect(valueOutput(canvas).textContent).toBe(expected))
const expectSubmitted = (canvas: Canvas, expected: string) =>
  waitFor(() => expect(canvas.getByRole('status', {name: 'Submitted'}).textContent).toBe(expected))
const expectSelection = (canvas: Canvas, expected: string) =>
  waitFor(() => expect(canvas.getByRole('status', {name: 'Selection'}).textContent).toBe(expected))

async function openEditor(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const editor = await waitFor(() => textbox(canvas))
  await userEvent.click(editor)
  return {canvas, editor}
}

function modifySelection(
  editor: HTMLElement,
  alter: 'move' | 'extend',
  direction: 'backward' | 'forward',
  steps: {granularity: 'character' | 'lineboundary'; count?: number},
) {
  const selection = editor.ownerDocument.getSelection()
  for (let step = 0; step < (steps.count ?? 1); step += 1) selection?.modify(alter, direction, steps.granularity)
}

async function selectFirstSlashItem(canvas: Canvas, expectedValue: string) {
  await userEvent.keyboard('/')
  await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
  await userEvent.keyboard('{Enter}')
  await expectValue(canvas, expectedValue)
}

export const SlashSelectInsertsChipAndSpace: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('listbox', {name: 'Slash commands'})).toBeVisible())
    await expect(canvas.getAllByRole('option')).toHaveLength(3)
    await userEvent.keyboard('cl')
    await waitFor(() => expect(canvas.queryByRole('option', {name: '/help'})).not.toBeInTheDocument())
    await expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"/clear "')
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument()
    await expect(within(editor).getByText('/clear')).toBeVisible()
    await userEvent.keyboard('hi')
    await expectValue(canvas, '"/clear hi"')
  },
}

export const MentionArrowSelect: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await userEvent.keyboard('@')
    await waitFor(() => expect(canvas.getByRole('listbox', {name: 'Mention a participant'})).toBeVisible())
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"@ai:sonnet "')
    await expect(within(editor).getByText('@Sonnet')).toBeVisible()
  },
}

export const ArrowNavigationWraps: Story = {
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toHaveAttribute('aria-selected', 'true'))
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/help'})).toHaveAttribute('aria-selected', 'true'))
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toHaveAttribute('aria-selected', 'true'))
  },
}

export const ChipAtomicBackspace: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await selectFirstSlashItem(canvas, '"/clear "')
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '"/clear"')
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '""')
    await expect(within(editor).queryByText('/clear')).not.toBeInTheDocument()
  },
}

export const ChipAtomicForwardDelete: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await selectFirstSlashItem(canvas, '"/clear "')
    await userEvent.keyboard('x')
    await expectValue(canvas, '"/clear x"')
    await expectSelection(canvas, '8:8')
    modifySelection(editor, 'move', 'backward', {granularity: 'lineboundary'})
    await expectSelection(canvas, '0:0')
    await userEvent.keyboard('{Delete}')
    await expectValue(canvas, '" x"')
    await expect(within(editor).queryByText('/clear')).not.toBeInTheDocument()
  },
}

export const RangeCutAcrossChips: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await userEvent.keyboard('hi ')
    await selectFirstSlashItem(canvas, '"hi /clear "')
    await userEvent.keyboard('yo')
    await expectValue(canvas, '"hi /clear yo"')
    await expectSelection(canvas, '12:12')
    modifySelection(editor, 'extend', 'backward', {granularity: 'character', count: 4})
    await expectSelection(canvas, '3:12')
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '"hi "')
    await expect(within(editor).queryByText('/clear')).not.toBeInTheDocument()
  },
}

export const UndoRedoChipInsert: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    const modifier = undoModifier()
    await userEvent.keyboard('/cl')
    await expectValue(canvas, '"/cl"')
    await settleHistoryGroup()
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"/clear "')
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expectValue(canvas, '"/cl"')
    await userEvent.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`)
    await expectValue(canvas, '"/clear "')
    await expect(within(editor).getByText('/clear')).toBeVisible()
  },
}

export const UndoRestoresDeletedChip: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    const modifier = undoModifier()
    await selectFirstSlashItem(canvas, '"/clear "')
    await settleHistoryGroup()
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '"/clear"')
    await settleHistoryGroup()
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '""')
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expectValue(canvas, '"/clear"')
    await expect(within(editor).getByText('/clear')).toBeVisible()
  },
}

export const ExternalReplaceFlattensChips: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    const modifier = undoModifier()
    await selectFirstSlashItem(canvas, '"/clear "')
    await userEvent.click(canvas.getByRole('button', {name: 'Replace with directive'}))
    await expectValue(canvas, '"@ai:opus"')
    await expect(within(editor).getByText('@ai:opus')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', {name: 'Focus end'}))
    await waitFor(() => expect(textbox(canvas)).toHaveFocus())
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expectValue(canvas, '"@ai:opus"')
    await userEvent.keyboard('{Backspace}')
    await expectValue(canvas, '"@ai:opu"')
  },
}

export const InsertTextPreservesChips: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    const modifier = undoModifier()
    await selectFirstSlashItem(canvas, '"/clear "')
    await settleHistoryGroup()
    await userEvent.click(canvas.getByRole('button', {name: 'Insert text'}))
    await expectValue(canvas, '"/clear  inserted"')
    await expect(within(editor).getByText('/clear')).toBeVisible()
    await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`)
    await expectValue(canvas, '"/clear "')
    await expect(within(editor).getByText('/clear')).toBeVisible()
  },
}

export const EscapeDismissKeepsTypedText: Story = {
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/cl')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).not.toBeInTheDocument())
    await expect(textbox(canvas)).toHaveAttribute('aria-expanded', 'false')
    await expectValue(canvas, '"/cl"')
    await userEvent.keyboard('x')
    await expectValue(canvas, '"/clx"')
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expectSubmitted(canvas, '"/clx"')
  },
}

export const AsyncLoadingThenReady: Story = {
  args: {mode: 'delayed'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByText('Loading suggestions…')).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await expect(canvas.queryByText('Loading suggestions…')).not.toBeInTheDocument()
  },
}

export const AsyncEmpty: Story = {
  args: {mode: 'empty'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByText('No matches')).toBeVisible())
    await expect(canvas.queryByRole('option')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expectSubmitted(canvas, '"/"')
  },
}

export const AsyncError: Story = {
  args: {mode: 'error'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByText('Suggestions failed to load')).toBeVisible())
    await expect(canvas.queryByRole('option')).not.toBeInTheDocument()
  },
}

export const StaleResultAfterCloseDiscarded: Story = {
  args: {mode: 'manual'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Resolve root'})).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve root'}))
    await waitFor(() => expect(canvas.queryByRole('button', {name: 'Resolve root'})).not.toBeInTheDocument())
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('option')).not.toBeInTheDocument()
  },
}

export const StaleResultAfterQueryMovesDiscarded: Story = {
  args: {mode: 'manual'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Resolve root'})).toBeVisible())
    await userEvent.keyboard('c')
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Resolve c'})).toBeVisible())
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve root'}))
    await waitFor(() => expect(canvas.queryByRole('button', {name: 'Resolve root'})).not.toBeInTheDocument())
    await expect(canvas.queryByRole('option')).not.toBeInTheDocument()
    await expect(canvas.getByText('Loading suggestions…')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve c'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible()
  },
}

export const LoadingKeepsCarriedItemsInert: Story = {
  args: {mode: 'manual'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Resolve root'})).toBeVisible())
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve root'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toHaveAttribute('aria-selected', 'true'))
    await userEvent.click(canvas.getByRole('button', {name: 'Focus end'}))
    await waitFor(() => expect(textbox(canvas)).toHaveFocus())
    await userEvent.keyboard('c')
    await expectValue(canvas, '"/c"')
    await waitFor(() => expect(canvas.getByRole('button', {name: 'Resolve c'})).toBeVisible())
    await expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"/c"')
    await expectSubmitted(canvas, '""')
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('option', {name: '/clear'})).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByText('Loading suggestions…')).toBeVisible()
    await userEvent.click(canvas.getByRole('option', {name: '/clear'}))
    await expectValue(canvas, '"/c"')
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve c'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await expect(canvas.queryByText('Loading suggestions…')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('option', {name: '/clear'}))
    await expectValue(canvas, '"/clear "')
  },
}

export const EnterDuringInitialLoadingDoesNotSubmit: Story = {
  args: {mode: 'manual'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByText('Loading suggestions…')).toBeVisible())
    await expect(canvas.queryByRole('option')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"/"')
    await expectSubmitted(canvas, '""')
    await userEvent.click(canvas.getByRole('button', {name: 'Resolve root'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: '/clear'}))
    await expectValue(canvas, '"/clear "')
  },
}

export const ShiftEnterBreaksLineWhileTypeaheadIsOpen: Story = {
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('hi /cl')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/clear'})).toBeVisible())
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await expectValue(canvas, '"hi /cl\\n"')
    await expectSubmitted(canvas, '""')
    await userEvent.keyboard('more')
    await expectValue(canvas, '"hi /cl\\nmore"')
  },
}

export const ActiveOptionScrollsIntoView: Story = {
  args: {mode: 'long'},
  play: async ({canvasElement}) => {
    const {canvas} = await openEditor(canvasElement)
    await userEvent.keyboard('/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/command-00'})).toBeVisible())
    for (let step = 0; step < 20; step += 1) await userEvent.keyboard('{ArrowDown}')
    const active = canvas.getByRole('option', {name: '/command-20'})
    await waitFor(() => expect(active).toHaveAttribute('aria-selected', 'true'))
    await expect(canvas.getByRole('listbox', {name: 'Slash commands'})).toContainElement(active)
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"/command-20 "')
  },
}

export const ScreenReaderSurface: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await expect(editor).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard('/')
    const listbox = await waitFor(() => canvas.getByRole('listbox', {name: 'Slash commands'}))
    await expect(editor).toHaveAttribute('aria-expanded', 'true')
    await expect(editor).toHaveAttribute('aria-haspopup', 'listbox')
    await expect(editor.getAttribute('aria-controls')).toBe(listbox.id)
    const options = canvas.getAllByRole('option')
    await waitFor(() => expect(editor.getAttribute('aria-activedescendant')).toBe(options[0]?.id))
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(editor.getAttribute('aria-activedescendant')).toBe(options[1]?.id))
    await expect(options[1]).toHaveAccessibleName('/compact')
  },
}

export const TrailingSpaceNotDuplicated: Story = {
  play: async ({canvasElement}) => {
    const {canvas, editor} = await openEditor(canvasElement)
    await userEvent.keyboard(' b')
    await expectValue(canvas, '" b"')
    await expectSelection(canvas, '2:2')
    modifySelection(editor, 'move', 'backward', {granularity: 'lineboundary'})
    await expectSelection(canvas, '0:0')
    await userEvent.keyboard('@')
    await waitFor(() => expect(canvas.getByRole('option', {name: '@Opus'})).toBeVisible())
    await userEvent.keyboard('{Enter}')
    await expectValue(canvas, '"@ai:opus b"')
  },
}
