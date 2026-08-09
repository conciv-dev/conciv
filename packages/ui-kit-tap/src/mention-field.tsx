import {Show, createEffect, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {HardBreak} from '@tiptap/extension-hard-break'
import {Mention} from '@tiptap/extension-mention'
import {AnchoredListbox, Avatar} from '@conciv/ui-kit-system'
import {TriggerMenu, createTriggerMenu, triggerPopupAttributes} from './trigger-menu.js'
import {
  dismissTrigger,
  triggerMenuKeyDown,
  triggerSuggestion,
  type RichTextFieldTriggerSource,
} from './trigger-suggestions.js'

export type MentionItem = {id: string; label: string}
export type MentionSegment = {type: 'text'; text: string} | {type: 'mention'; id: string; label: string}
export type MentionFieldApi = {focus: () => void; clear: () => void; submit: () => void; element: HTMLElement}

type JsonNode = {type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[]}

const EDITOR =
  'min-h-7 max-h-32 overflow-auto bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] px-2 py-1.5 [outline:none] focus-within:[border-color:var(--pw-accent-line)] [&_.tiptap]:[outline:none] [&_[data-mention]]:text-pw-accent-hi [&_[data-mention]]:bg-pw-accent-08 [&_[data-mention]]:rounded-pw-sm [&_[data-mention]]:px-0.5'
const PLACEHOLDER = 'pointer-events-none absolute left-2 top-1.5 text-[0.8125rem] text-pw-text-3 select-none'
const OPTION_ROW = 'flex items-center gap-2 min-w-0'
const OPTION_AVATAR = 'size-5'

const avatarInitial = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

function MentionOption(props: {label: string}): JSX.Element {
  return (
    <span class={OPTION_ROW}>
      <Avatar.Root class={OPTION_AVATAR}>
        <Avatar.Fallback>{avatarInitial(props.label)}</Avatar.Fallback>
      </Avatar.Root>
      <AnchoredListbox.ItemText>{props.label}</AnchoredListbox.ItemText>
    </span>
  )
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

function submitsOnEnter(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter') return false
  return !event.shiftKey
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
  const menu = createTriggerMenu()

  const placeholderText = () => empty() && props.placeholder
  const rootClass = () => `w-full relative ${props.class ?? ''}`
  const source = (): RichTextFieldTriggerSource => ({
    label: 'Mention a participant',
    items: (query) => props.items(query),
  })
  const suggestions = [triggerSuggestion({char: '@', source, access: menu.access})]
  const dismissMenu = (char: string): void => {
    if (editor) dismissTrigger(editor.view, suggestions, char)
  }
  const editableAttributes = (): Record<string, string> => ({
    role: 'textbox',
    'aria-label': props.ariaLabel ?? 'Message',
    'aria-multiline': 'true',
    ...triggerPopupAttributes(menu),
  })

  const submit = (): void => {
    if (!editor || editor.isEmpty) return
    props.onSubmit(serialize(editor.getJSON()))
    editor.commands.clearContent()
    setEmpty(true)
    props.onEmptyChange?.(true)
  }

  onMount(() => {
    if (!host) return
    const instance = new Editor({
      element: host,
      editorProps: {
        attributes: editableAttributes(),
        handleKeyDown: (_view, event) => {
          if (triggerMenuKeyDown(menu.access, event, {dismiss: dismissMenu, tabCommits: true})) return true
          if (!submitsOnEnter(event)) return false
          event.preventDefault()
          submit()
          return true
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
          suggestions,
        }),
      ],
    })
    editor = instance
    createEffect(() => instance.view.setProps({attributes: editableAttributes()}))
    props.onReady?.({
      focus: () => instance.commands.focus(),
      clear: () => instance.commands.clearContent(),
      submit,
      element: instance.view.dom,
    })
  })
  onCleanup(() => editor?.destroy())

  return (
    <div class={rootClass()}>
      <div ref={(element) => (host = element)} class={EDITOR} />
      <Show when={placeholderText()}>{(text) => <span class={PLACEHOLDER}>{text()}</span>}</Show>
      <TriggerMenu menu={menu} onDismiss={dismissMenu} onRefocus={() => editor?.commands.focus()}>
        {(item) => <MentionOption label={item.label} />}
      </TriggerMenu>
    </div>
  )
}
