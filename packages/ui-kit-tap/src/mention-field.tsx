import {Show, createMemo, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {HardBreak} from '@tiptap/extension-hard-break'
import {Mention} from '@tiptap/extension-mention'
import {Avatar} from '@conciv/ui-kit-system'
import {TriggerMenu, type TriggerMenuAnchor} from './trigger/menu.js'
import {createTriggerKeyboard} from './trigger/keyboard.js'
import {createTriggerNavigation} from './trigger/navigation.js'
import {isTriggerItem, type TriggerAdapter, type TriggerEntry, type TriggerItem} from './trigger/types.js'

export type MentionItem = {id: string; label: string}
export type MentionSegment = {type: 'text'; text: string} | {type: 'mention'; id: string; label: string}
export type MentionFieldApi = {focus: () => void; clear: () => void; submit: () => void; element: HTMLElement}

type SuggestionState = {
  items: MentionItem[]
  command: (item: MentionItem) => void
  rect: DOMRect | null
  query: string
}
type JsonNode = {type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[]}

const EDITOR =
  'min-h-7 max-h-32 overflow-auto bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] px-2 py-1.5 [outline:none] focus-within:[border-color:var(--pw-accent-line)] [&_.tiptap]:[outline:none] [&_[data-mention]]:text-pw-accent-hi [&_[data-mention]]:bg-pw-accent-08 [&_[data-mention]]:rounded-pw-sm [&_[data-mention]]:px-0.5'
const PLACEHOLDER = 'pointer-events-none absolute left-2 top-1.5 text-[0.8125rem] text-pw-text-3 select-none'

const avatarInitial = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

function anchorOf(state: SuggestionState | null): TriggerMenuAnchor | null {
  if (!state || state.items.length === 0 || !state.rect) return null
  const {x, y, width, height} = state.rect
  return {x, y, width, height}
}

function mentionAdapter(state: SuggestionState): TriggerAdapter {
  return {
    categories: () => [],
    categoryItems: () => [],
    search: () => state.items.map((item): TriggerItem => ({...item, type: '@'})),
  }
}

const serialize = (doc: JsonNode): MentionSegment[] => {
  const out: MentionSegment[] = []
  const pushText = (text: string): void => {
    if (!text) return
    const last = out.at(-1)
    if (last && last.type === 'text') last.text += text
    else out.push({type: 'text', text})
  }
  const inline = (nodes: JsonNode[] | undefined): void =>
    (nodes ?? []).forEach((node) => {
      if (node.type === 'text') pushText(node.text ?? '')
      else if (node.type === 'mention')
        out.push({
          type: 'mention',
          id: String(node.attrs?.id ?? ''),
          label: String(node.attrs?.label ?? node.attrs?.id ?? ''),
        })
      else if (node.type === 'hardBreak') pushText('\n')
    })
  const blocks = doc.content ?? []
  blocks.forEach((block, index) => {
    inline(block.content)
    if (index < blocks.length - 1) pushText('\n')
  })
  return out
}

export function MentionField(props: {
  items: (query: string) => MentionItem[]
  onSubmit: (segments: MentionSegment[]) => void
  onReady?: (api: MentionFieldApi) => void
  onEmptyChange?: (empty: boolean) => void
  placeholder?: string
  ariaLabel?: string
  class?: string
}): JSX.Element {
  let host: HTMLDivElement | undefined
  let editor: Editor | undefined
  const [empty, setEmpty] = createSignal(true)
  const [suggestion, setSuggestion] = createSignal<SuggestionState | null>(null)
  const open = () => suggestion() !== null
  const adapter = createMemo<TriggerAdapter | undefined>(() => {
    const state = suggestion()
    return state ? mentionAdapter(state) : undefined
  })
  const navigation = createTriggerNavigation({adapter, query: () => suggestion()?.query ?? '', open})
  const selectMention = (item: TriggerItem) => suggestion()?.command(item)
  const keyboard = createTriggerKeyboard({
    navigableList: navigation.navigableList,
    isSearchMode: navigation.isSearchMode,
    activeCategoryId: navigation.activeCategoryId,
    query: () => suggestion()?.query ?? '',
    popoverId: 'mention-field',
    open,
    selectItem: selectMention,
    selectCategory: navigation.selectCategory,
    goBack: navigation.goBack,
  })

  const anchor = () => anchorOf(suggestion())
  const placeholderText = () => empty() && props.placeholder
  const rootClass = () => `w-full relative ${props.class ?? ''}`

  const submit = (): void => {
    if (!editor || editor.isEmpty) return
    props.onSubmit(serialize(editor.getJSON() as JsonNode))
    editor.commands.clearContent()
    setEmpty(true)
    props.onEmptyChange?.(true)
  }

  onMount(() => {
    if (!host) return
    editor = new Editor({
      element: host,
      editorProps: {
        attributes: {role: 'textbox', 'aria-label': props.ariaLabel ?? 'Message', 'aria-multiline': 'true'},
        handleKeyDown: (_view, event) => {
          if (event.key === 'Enter' && !event.shiftKey && !suggestion()) {
            event.preventDefault()
            submit()
            return true
          }
          return false
        },
      },
      onUpdate: ({editor: instance}) => {
        setEmpty(instance.isEmpty)
        props.onEmptyChange?.(instance.isEmpty)
      },
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        Mention.configure({
          HTMLAttributes: {'data-mention': ''},
          suggestion: {
            char: '@',
            items: ({query}) => props.items(query),
            render: () => ({
              onStart: (start) =>
                setSuggestion({
                  items: start.items,
                  command: start.command,
                  rect: start.clientRect?.() ?? null,
                  query: start.query,
                }),
              onUpdate: (update) =>
                setSuggestion({
                  items: update.items,
                  command: update.command,
                  rect: update.clientRect?.() ?? null,
                  query: update.query,
                }),
              onExit: () => setSuggestion(null),
              onKeyDown: ({event}) => keyboard.handleKeyDown(event),
            }),
          },
        }),
      ],
    })
    props.onReady?.({
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      submit,
      element: editor.view.dom,
    })
  })
  onCleanup(() => editor?.destroy())

  return (
    <div class={rootClass()}>
      <div ref={(element) => (host = element)} class={EDITOR} />
      <Show when={placeholderText()}>{(text) => <span class={PLACEHOLDER}>{text()}</span>}</Show>
      <TriggerMenu
        anchor={anchor()}
        label="Mention a participant"
        entries={navigation.navigableList()}
        highlightedId={keyboard.highlightedEntryId()}
        onSelect={(entry) => {
          if (isTriggerItem(entry)) selectMention(entry)
        }}
        onHighlight={keyboard.highlightIndex}
        onDismiss={() => setSuggestion(null)}
        renderOption={(entry: TriggerEntry) => (
          <>
            <Avatar.Root class="size-5">
              <Avatar.Fallback>{avatarInitial(entry.label)}</Avatar.Fallback>
            </Avatar.Root>
            {entry.label}
          </>
        )}
      />
    </div>
  )
}
