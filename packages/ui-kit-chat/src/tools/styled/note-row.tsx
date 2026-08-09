import type {JSX} from 'solid-js'
import {MoveUpRight} from 'lucide-solid'

export type NoteRowTone = 'link' | 'accent'

const NOTE_ROW = 'text-[length:var(--chat-text-xs)] flex gap-1.5 items-center m-0'

const NOTE_ROW_TONE: Record<NoteRowTone, string> = {
  link: `${NOTE_ROW} [color:var(--chat-accent-link)]`,
  accent: `${NOTE_ROW} [color:var(--chat-accent)]`,
}

export function NoteRow(props: {icon: JSX.Element; tone: NoteRowTone; children: JSX.Element}): JSX.Element {
  return (
    <p class={NOTE_ROW_TONE[props.tone]}>
      {props.icon}
      <span>{props.children}</span>
    </p>
  )
}

export function MirrorRow(): JSX.Element {
  return (
    <NoteRow icon={<MoveUpRight size={12} aria-hidden="true" />} tone="link">
      shown on your page
    </NoteRow>
  )
}
