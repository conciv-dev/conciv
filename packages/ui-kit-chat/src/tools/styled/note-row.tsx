import {splitProps, type JSX} from 'solid-js'

export type NoteRowTone = 'link' | 'accent'

const NOTE_ROW = 'text-[length:var(--chat-text-xs)] flex gap-1.5 items-center m-0'

const NOTE_ROW_TONE: Record<NoteRowTone, string> = {
  link: `${NOTE_ROW} [color:var(--chat-accent-link)]`,
  accent: `${NOTE_ROW} [color:var(--chat-accent)]`,
}

export function NoteRow(props: {icon: JSX.Element; tone: NoteRowTone; children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['icon', 'tone', 'children'])
  return (
    <p {...rest} class={NOTE_ROW_TONE[local.tone]}>
      {local.icon}
      <span>{local.children}</span>
    </p>
  )
}
