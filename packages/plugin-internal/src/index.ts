import type {JSX} from 'solid-js'
import {createOpaqueType, type OpaqueType} from '@internal/opaque'
import type {IconName, NoteCard, NoteCardProps, Registry, ToolProps, Ui} from '@conciv/plugin/experimental'

export interface InternalBasicToolProps extends ToolProps {
  readonly icon?: IconName
  readonly title: string
  readonly subtitle?: string
  readonly subtitleTone?: 'default' | 'muted' | 'warning' | 'danger'
  readonly failed?: boolean
  readonly expandable?: boolean
  readonly openWhileRunning?: boolean
  readonly children?: JSX.Element
}

export interface InternalErrorMessageProps {
  readonly message: string
  readonly label?: string
}

export interface InternalTruncatedTextProps {
  readonly text: string
  readonly class?: string
}

export interface InternalStatusDotProps {
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'running'
}

export interface InternalJsonProps {
  readonly value: unknown
}

export interface InternalImageProps {
  readonly src: string
  readonly alt: string
}

export interface InternalCopyButtonProps {
  readonly text: string
  readonly label: string
  readonly onCopied?: () => void
}

export interface InternalCollapsibleProps {
  readonly trigger: string
  readonly children: JSX.Element
  readonly defaultOpen?: boolean
}

export type MentionItem = {id: string; label: string}

export type MentionSegment = {type: 'text'; text: string} | {type: 'mention'; id: string; label: string}

export type MentionFieldApi = {focus: () => void; clear: () => void; submit: () => void; element: HTMLElement}

export interface InternalMentionFieldProps {
  items: (query: string) => MentionItem[]
  onSubmit: (segments: MentionSegment[]) => void
  onReady?: (api: MentionFieldApi) => void
  onEmptyChange?: (empty: boolean) => void
  placeholder?: string
  readonly ariaLabel: string
  class?: string
}

interface InternalUiMembers {
  BasicTool(props: InternalBasicToolProps): JSX.Element
  ErrorMessage(props: InternalErrorMessageProps): JSX.Element
  TruncatedText(props: InternalTruncatedTextProps): JSX.Element
  StatusDot(props: InternalStatusDotProps): JSX.Element
  Json(props: InternalJsonProps): JSX.Element
  Image(props: InternalImageProps): JSX.Element
  MentionField(props: InternalMentionFieldProps): JSX.Element
  CopyButton(props: InternalCopyButtonProps): JSX.Element
  Collapsible(props: InternalCollapsibleProps): JSX.Element
}

type OpaqueUiShape = {
  public: Ui & {readonly $$type: '@conciv/Ui'}
  versions: InternalUiMembers & {readonly version: 'v1'}
}

export type InternalUi = OpaqueUiShape['public'] & OpaqueUiShape['versions']

export const OpaqueUi: OpaqueType<OpaqueUiShape> = createOpaqueType<OpaqueUiShape>({
  type: '@conciv/Ui',
  versions: ['v1'],
})

export interface InternalNoteCard {
  readonly origins: readonly string[]
  render(props: NoteCardProps): JSX.Element | undefined
}

type OpaqueNoteCardShape = {
  public: NoteCard
  versions: Registry<InternalNoteCard> & {readonly version: 'v1'}
}

export const OpaqueNoteCard: OpaqueType<OpaqueNoteCardShape> = createOpaqueType<OpaqueNoteCardShape>({
  type: '@conciv/NoteCard',
  versions: ['v1'],
})
