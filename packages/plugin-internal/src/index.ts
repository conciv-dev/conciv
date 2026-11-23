import type {ComponentProps, JSX} from 'solid-js'
import {z} from 'zod'
import type {IconName, Plugin, SetupContext, ToolProps, Ui} from '@conciv/plugin/experimental'
import type {MentionField} from '@conciv/ui-kit-tap'

export type {MentionFieldApi, MentionItem, MentionSegment} from '@conciv/ui-kit-tap'

const INTERNAL_PLUGIN = '@conciv/InternalPlugin' as const
const VERSION = 'v1' as const

const Tagged = z.object({$$type: z.literal(INTERNAL_PLUGIN)})
const Stamped = z.object({$$type: z.literal(INTERNAL_PLUGIN), version: z.unknown()})

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

export type InternalMentionFieldProps = ComponentProps<typeof MentionField> & {readonly ariaLabel: string}

export interface InternalUi extends Ui {
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

type Stores = NonNullable<Plugin.Declarations['stores']>

type Icons = NonNullable<Plugin.Declarations['icons']>

export type InternalSetupContext<D> = SetupContext<D> & {readonly ui: InternalUi}

export type InternalPluginInput<S extends Stores, I extends Icons = {}> = Plugin.Declarations<S, I> & {
  readonly setup: (ctx: InternalSetupContext<NoInfer<Plugin.Declarations<S, I>>>) => Plugin.Cleanup | void
}

export function defineInternalPlugin<const S extends Stores = {}, const I extends Icons = {}>(
  plugin: InternalPluginInput<S, I>,
): Plugin.Definition<S, I> {
  const setup = plugin.setup as Plugin.Setup<NoInfer<Plugin.Declarations<S, I>>>
  const stamped = {...plugin, setup, $$type: INTERNAL_PLUGIN, version: VERSION}
  return stamped
}

export function isInternalPlugin(value: unknown): boolean {
  return Tagged.safeParse(value).success
}

export function readInternalPlugin(value: unknown): typeof VERSION {
  const stamp = Stamped.parse(value)

  if (stamp.version !== VERSION)
    throw new Error(
      `An internal plugin definition is stamped for another app: got version '${String(stamp.version)}', expected '${VERSION}'`,
    )

  return VERSION
}
