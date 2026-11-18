import {createMemo, For, Show, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {Key} from '@solid-primitives/keyed'
import {isEqual, isNil} from 'es-toolkit'
import {TruncatedText} from '@conciv/ui-kit-system'
import {CornerRemoveButton, useComposerContext} from '@conciv/ui-kit-chat'
import {NoteCard, type IconName, type MountedSession, type NoteCardProps} from '@conciv/plugin/experimental'
import {usePluginHost, type Item} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {icons} from '../runtime/plugin/icons'
import type {ChatMessage, NoteComment} from '@conciv/protocol/chat-message-types'
import {decodeNotes} from './note-schema'
import {readPromptPresentation} from './comment-note'

const FALLBACK_ICON: IconName = 'message-square'

const FRAME =
  'group relative flex flex-1 flex-col gap-0.5 min-w-0 p-3 rounded-chat-surface-sm border border-chat-line bg-chat-fill text-chat-sm text-chat-text-hi'
const HEADING = 'block truncate text-chat-sm text-chat-text-hi'
const META = 'flex items-center gap-1 min-w-0 text-chat-xs text-chat-text-3'

function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name)
}

function noteIcon(name: string): IconName {
  return isIconName(name) ? name : FALLBACK_ICON
}

function noteHeading(note: NoteComment): string {
  return note.comment.trim() || note.title?.trim() || note.label
}

function noteSubtitle(note: NoteComment): string {
  return note.subtitle?.trim() || note.label
}

function NoteChip(props: {note: NoteComment}): JSX.Element {
  return (
    <>
      <TruncatedText class={HEADING} text={noteHeading(props.note)} />
      <span class={META}>
        <Dynamic component={icons[noteIcon(props.note.icon)]} size={12} class="shrink-0" aria-hidden="true" />
        <TruncatedText class="block truncate" text={noteSubtitle(props.note)} />
      </span>
    </>
  )
}

function DrawnNoteCard(props: {
  claimant: Item<NoteCard>
  note: Accessor<NoteComment>
  session: MountedSession | undefined
}): JSX.Element {
  const [state, setState] = createStore({failed: false})
  const pluginNote = createMemo((): NoteCardProps['note'] => ({...props.note(), icon: noteIcon(props.note().icon)}))

  return (
    <Show when={!state.failed} fallback={<NoteChip note={props.note()} />}>
      <Contribution plugin={props.claimant.plugin} failed={() => setState('failed', true)}>
        {() => {
          const drawn = props.claimant.value.render({
            get note() {
              return pluginNote()
            },
            get session() {
              return props.session
            },
          })

          return (
            <Show when={!isNil(drawn)} fallback={<NoteChip note={props.note()} />}>
              {drawn}
            </Show>
          )
        }}
      </Contribution>
    </Show>
  )
}

function PluginNoteCard(props: {
  note: NoteComment
  session: MountedSession | undefined
  remove?: {label: string; onRemove: () => void}
}): JSX.Element {
  const host = usePluginHost()
  const note = createMemo(() => props.note, undefined, {equals: isEqual})
  const attempt = createMemo(() => {
    const current = note()
    const claimant = host.items(NoteCard).find((item) => item.value.origins.includes(current.origin))

    return claimant && {claimant, note: current}
  })

  return (
    <div class={FRAME}>
      <Show when={attempt()} keyed fallback={<NoteChip note={props.note} />}>
        {(current) => <DrawnNoteCard claimant={current.claimant} note={note} session={props.session} />}
      </Show>
      <Show when={props.remove}>
        {(remove) => <CornerRemoveButton label={remove().label} onRemove={remove().onRemove} />}
      </Show>
    </div>
  )
}

export function ComposerNotes(props: {session: Accessor<MountedSession | undefined>; onRemoved: () => void}) {
  const context = useComposerContext()
  const notes = createMemo(() => decodeNotes(context.items()))
  const remove = (key: string) => {
    context.removeItem(key)
    props.onRemoved()
  }

  return (
    <Show when={notes().length > 0}>
      <ul aria-label="Notes" class="flex shrink-0 items-start gap-2 list-none p-0">
        <Key each={notes()} by={(entry) => entry.key}>
          {(entry) => (
            <li class="flex shrink-0 min-w-24 max-w-56 anim-presence-in">
              <PluginNoteCard
                note={entry().note}
                session={props.session()}
                remove={{label: `Remove ${noteHeading(entry().note)}`, onRemove: () => remove(entry().key)}}
              />
            </li>
          )}
        </Key>
      </ul>
    </Show>
  )
}

export function SentNotes(props: {
  messages: Accessor<readonly ChatMessage[]>
  session: Accessor<MountedSession | undefined>
}): JSX.Element {
  const notes = createMemo(() =>
    props.messages().flatMap((message) => readPromptPresentation(message.metadata)?.comments ?? []),
  )

  return (
    <Show when={notes().length > 0}>
      <ul aria-label="Notes on this message" class="flex flex-col gap-2 w-full max-w-80 list-none p-0">
        <For each={notes()}>
          {(note) => (
            <li class="flex flex-col">
              <PluginNoteCard note={note} session={props.session()} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}
