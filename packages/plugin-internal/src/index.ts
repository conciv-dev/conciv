import type {ComponentProps, JSX} from 'solid-js'
import {createOpaqueType, type OpaqueType} from '@internal/opaque'
import {Registry, type ComposerNote, type IconName, type MountedSession, type Ui} from '@conciv/plugin/experimental'
import type {HarnessModelSelector, MorphLabel, ReasoningText, useModelMenu} from '@conciv/ui-kit-chat'
import type {
  CardHeadline,
  Chip,
  ChipRow,
  clip,
  CodeBlock,
  CollapsibleSection,
  displayValue,
  ErrorBlock,
  JsonTree,
  parseInput,
  parseResultPayload,
  ResultImage,
  resultText,
  StatusVisual,
  ToolCard,
  ToolEntry,
  ToolErrorCard,
  ToolProps,
} from '@conciv/ui-kit-chat/tools'
import type {Button, Dialog, Kbd, Loader, prefersReducedMotion, TruncatedTextProps} from '@conciv/ui-kit-system'
import type {MentionField} from '@conciv/ui-kit-tap'

export type {CardChip, ToolComponent, ToolProps, ToolStatus} from '@conciv/ui-kit-chat/tools'
export type {MentionFieldApi, MentionItem, MentionSegment} from '@conciv/ui-kit-tap'

export interface InternalBasicToolProps extends ToolProps {
  readonly icon?: IconName
  readonly title: string
  readonly subtitle?: string
  readonly subtitleTone?: 'default' | 'muted' | 'warning' | 'danger'
  readonly failed?: boolean
  readonly expandable?: boolean
  readonly openWhileRunning?: boolean
  readonly args?: string[]
  readonly children?: JSX.Element
}

export interface InternalStatusDotProps {
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'running'
}

export interface InternalJsonProps {
  readonly value: unknown
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

interface InternalUiMembers {
  BasicTool(props: InternalBasicToolProps): JSX.Element
  ErrorMessage(props: ComponentProps<typeof ErrorBlock>): JSX.Element
  TruncatedText(props: TruncatedTextProps): JSX.Element
  StatusDot(props: InternalStatusDotProps): JSX.Element
  Json(props: InternalJsonProps): JSX.Element
  Image(props: ComponentProps<typeof ResultImage>): JSX.Element
  MentionField(props: ComponentProps<typeof MentionField>): JSX.Element
  CopyButton(props: InternalCopyButtonProps): JSX.Element
  Collapsible(props: InternalCollapsibleProps): JSX.Element
  HarnessModelSelector(props: ComponentProps<typeof HarnessModelSelector>): JSX.Element
  useModelMenu: typeof useModelMenu
  ToolCard: typeof ToolCard
  CardHeadline: typeof CardHeadline
  CodeBlock: typeof CodeBlock
  CollapsibleSection: typeof CollapsibleSection
  StatusVisual: typeof StatusVisual
  JsonTree: typeof JsonTree
  ToolErrorCard: typeof ToolErrorCard
  ChipRow: typeof ChipRow
  MorphLabel: typeof MorphLabel
  ReasoningText: typeof ReasoningText
  Kbd: typeof Kbd
  KitChip: typeof Chip
  KitButton: typeof Button
  KitDialog: typeof Dialog
  KitLoader: typeof Loader
  clip: typeof clip
  displayValue: typeof displayValue
  parseInput: typeof parseInput
  resultText: typeof resultText
  parseResultPayload: typeof parseResultPayload
  prefersReducedMotion: typeof prefersReducedMotion
  readonly CARD_HEADLINE_TEXT: string
  readonly SHIMMER: string
  readonly SUNKEN_SURFACE: string
  readonly DANGER_TEXT_CLASS: string
  GENERIC_TOOL_ICON(props: {size: number}): JSX.Element
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

export interface NoteCardProps {
  readonly note: Omit<ComposerNote, 'commentId'> & {readonly commentId?: string}
  readonly session?: MountedSession
}

export interface InternalNoteCard {
  readonly origins: readonly string[]
  render(props: NoteCardProps): JSX.Element | undefined
}

type OpaqueNoteCardShape = {
  public: {readonly $$type: '@conciv/NoteCard'}
  versions: Registry<InternalNoteCard> & {readonly version: 'v1'}
}

export const OpaqueNoteCard: OpaqueType<OpaqueNoteCardShape> = createOpaqueType<OpaqueNoteCardShape>({
  type: '@conciv/NoteCard',
  versions: ['v1'],
})

export const NoteCard = OpaqueNoteCard.createInstance('v1', Registry.define<InternalNoteCard>('note-card'))

export type ToolRegistry = ToolEntry

export const ToolRegistry = Registry.define<ToolEntry>('tool-registry')
