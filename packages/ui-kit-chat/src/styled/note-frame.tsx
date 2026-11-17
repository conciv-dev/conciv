import type {JSX} from 'solid-js'

const FRAME =
  'flex flex-col justify-center gap-0.5 min-h-14 px-2.5 rounded-chat-surface-sm border border-chat-line bg-chat-fill text-chat-sm text-chat-text-hi'
const STAGED = `${FRAME} min-w-24 max-w-56`
const WIDE = `${FRAME} w-full`

export interface NoteFrameProps {
  wide?: boolean
  children: JSX.Element
}

export function NoteFrame(props: NoteFrameProps): JSX.Element {
  return <div class={props.wide ? WIDE : STAGED}>{props.children}</div>
}
