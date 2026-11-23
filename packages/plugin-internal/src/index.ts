import type {ComponentProps, JSX} from 'solid-js'
import {createOpaqueType} from '@conciv/opaque'
import type {
  ComposerNote,
  Contract,
  IconName,
  MountedSession,
  Registry,
  SetupContext,
  ToolProps,
  Ui,
} from '@conciv/plugin/experimental'
import type {MentionField} from '@conciv/ui-kit-tap'

export type {MentionFieldApi, MentionItem, MentionSegment} from '@conciv/ui-kit-tap'

export const OpaqueConcivContract = createOpaqueType<{
  public: {$$type: '@conciv/ConcivContract'; kind: 'contract'; id: string}
  versions: {version: 'v1'}
}>({type: '@conciv/ConcivContract', versions: ['v1']})

export interface ConcivBasicToolProps extends ToolProps {
  readonly icon?: IconName
  readonly title: string
  readonly subtitle?: string
  readonly subtitleTone?: 'default' | 'muted' | 'warning' | 'danger'
  readonly failed?: boolean
  readonly expandable?: boolean
  readonly openWhileRunning?: boolean
  readonly children?: JSX.Element
}

export interface ConcivErrorMessageProps {
  readonly message: string
  readonly label?: string
}

export interface ConcivTruncatedTextProps {
  readonly text: string
  readonly class?: string
}

export interface ConcivStatusDotProps {
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger' | 'running'
}

export interface ConcivJsonProps {
  readonly value: unknown
}

export interface ConcivImageProps {
  readonly src: string
  readonly alt: string
}

export interface ConcivCopyButtonProps {
  readonly text: string
  readonly label: string
  readonly onCopied?: () => void
}

export interface ConcivCollapsibleProps {
  readonly trigger: string
  readonly children: JSX.Element
  readonly defaultOpen?: boolean
}

export type ConcivMentionFieldProps = ComponentProps<typeof MentionField> & {readonly ariaLabel: string}

export interface ConcivUi extends Ui {
  BasicTool(props: ConcivBasicToolProps): JSX.Element
  ErrorMessage(props: ConcivErrorMessageProps): JSX.Element
  TruncatedText(props: ConcivTruncatedTextProps): JSX.Element
  StatusDot(props: ConcivStatusDotProps): JSX.Element
  Json(props: ConcivJsonProps): JSX.Element
  Image(props: ConcivImageProps): JSX.Element
  MentionField(props: ConcivMentionFieldProps): JSX.Element
  CopyButton(props: ConcivCopyButtonProps): JSX.Element
  Collapsible(props: ConcivCollapsibleProps): JSX.Element
}

export const OpaqueRegistry = createOpaqueType<{
  public: {$$type: '@conciv/Registry'; kind: 'registry'; id: string}
  versions: {version: 'v1'; access: 'public' | 'conciv'}
}>({type: '@conciv/Registry', versions: ['v1']})

export const ConcivUi = OpaqueConcivContract.createInstance<
  'v1',
  Contract<ConcivUi, 'conciv.ui'> & typeof OpaqueConcivContract.TPublic
>('v1', {kind: 'contract', id: 'conciv.ui'})

export function readConcivUi(context: Pick<SetupContext<{}>, 'use'>): ConcivUi {
  const live = context.use(ConcivUi)()

  if (live.status !== 'active') throw new Error('the conciv UI is answered by the conciv app only')

  return live.value
}

export interface NoteCardProps {
  readonly note: Omit<ComposerNote, 'commentId'> & {readonly commentId?: string}
  readonly session?: MountedSession
}

export interface NoteCard {
  readonly origins: readonly string[]
  render(props: NoteCardProps): JSX.Element | undefined
}

export const NoteCard = OpaqueRegistry.createInstance<'v1', Registry<NoteCard> & typeof OpaqueRegistry.TPublic>('v1', {
  kind: 'registry',
  id: 'note-card',
  access: 'conciv',
})
