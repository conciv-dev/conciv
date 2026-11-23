import type {JSX} from 'solid-js'
import {OpaqueType} from '@internal/opaque'
import type {IconName, NoteCard, NoteCardProps, Registry, ToolProps, Ui} from '@conciv/plugin/experimental'

export const OpaqueUi = OpaqueType.create<{
  public: Ui & {readonly $$type: '@conciv/Ui'}
  versions: {
    readonly version: 'v1'
    BasicTool(
      props: ToolProps & {
        readonly icon?: IconName
        readonly title: string
        readonly subtitle?: string
        readonly subtitleTone?: 'default' | 'muted' | 'warning' | 'danger'
        readonly failed?: boolean
        readonly expandable?: boolean
        readonly openWhileRunning?: boolean
        readonly children?: JSX.Element
      },
    ): JSX.Element
    ErrorMessage(props: {readonly message: string; readonly label?: string}): JSX.Element
    TruncatedText(props: {readonly text: string; readonly class?: string}): JSX.Element
    StatusDot(props: {readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'running'}): JSX.Element
    Json(props: {readonly value: unknown}): JSX.Element
    Image(props: {readonly src: string; readonly alt: string}): JSX.Element
    MentionField(props: {
      items: (query: string) => {id: string; label: string}[]
      onSubmit: (segments: ({type: 'text'; text: string} | {type: 'mention'; id: string; label: string})[]) => void
      onReady?: (api: {focus: () => void; clear: () => void; submit: () => void; element: HTMLElement}) => void
      onEmptyChange?: (empty: boolean) => void
      placeholder?: string
      readonly ariaLabel: string
      class?: string
    }): JSX.Element
    CopyButton(props: {readonly text: string; readonly label: string; readonly onCopied?: () => void}): JSX.Element
    Collapsible(props: {
      readonly trigger: string
      readonly children: JSX.Element
      readonly defaultOpen?: boolean
    }): JSX.Element
  }
}>({
  type: '@conciv/Ui',
  versions: ['v1'],
})

export const OpaqueNoteCard = OpaqueType.create<{
  public: NoteCard
  versions: Registry<{
    readonly origins: readonly string[]
    render(props: NoteCardProps): JSX.Element | undefined
  }> & {readonly version: 'v1'}
}>({
  type: '@conciv/NoteCard',
  versions: ['v1'],
})
