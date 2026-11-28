import {createContext, Show, splitProps, useContext, type ComponentProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import CircleCheck from 'lucide-solid/icons/circle-check'
import CircleX from 'lucide-solid/icons/circle-x'
import Info from 'lucide-solid/icons/info'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'

export type CalloutTone = 'info' | 'success' | 'warn' | 'danger'

const ROOT =
  'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 px-3 py-2.5 border rounded-chat-surface-md font-chat text-chat-sm text-chat-text [overflow-wrap:anywhere] [&>:not([data-part=icon])]:col-start-2'
const ICON = 'col-start-1 row-start-1 flex items-center h-1lh [&_svg]:size-4 [&_svg]:block'
const TITLE = 'font-medium'
const DESCRIPTION = 'text-chat-text-2'

type ToneStyle = {surface: string; icon: string; role: 'note' | 'status' | 'alert'; glyph: typeof Info}

const TONE: Record<CalloutTone, ToneStyle> = {
  info: {surface: 'border-chat-line bg-chat-fill', icon: 'text-chat-text-2', role: 'note', glyph: Info},
  success: {
    surface: 'border-chat-success-18 bg-chat-fill',
    icon: 'text-chat-success',
    role: 'note',
    glyph: CircleCheck,
  },
  warn: {surface: 'border-chat-warn-20 bg-chat-fill', icon: 'text-chat-warn', role: 'status', glyph: TriangleAlert},
  danger: {
    surface: 'border-chat-danger-line bg-chat-danger-10',
    icon: 'text-chat-danger',
    role: 'alert',
    glyph: CircleX,
  },
}

function defaultTone(): CalloutTone {
  return 'info'
}

const ToneContext = createContext(defaultTone)

function Root(props: ComponentProps<'div'> & {tone?: CalloutTone}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'tone'])
  const tone = () => local.tone ?? 'info'
  return (
    <ToneContext.Provider value={tone}>
      <div
        role={TONE[tone()].role}
        {...rest}
        data-scope="callout"
        data-part="root"
        data-tone={tone()}
        class={`${ROOT}  ${TONE[tone()].surface}  ${local.class ?? ''}`}
      />
    </ToneContext.Provider>
  )
}

function Icon(props: ComponentProps<'span'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  const tone = useContext(ToneContext)
  return (
    <span
      aria-hidden="true"
      {...rest}
      data-scope="callout"
      data-part="icon"
      class={`${ICON}  ${TONE[tone()].icon}  ${local.class ?? ''}`}
    >
      <Show when={local.children !== undefined} fallback={<Dynamic component={TONE[tone()].glyph} />}>
        {local.children}
      </Show>
    </span>
  )
}

function Title(props: ComponentProps<'p'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <p {...rest} data-scope="callout" data-part="title" class={`${TITLE}  ${local.class ?? ''}`} />
}

function Description(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} data-scope="callout" data-part="description" class={`${DESCRIPTION}  ${local.class ?? ''}`} />
}

export const Callout = {Root, Icon, Title, Description}
