import {createMemo, For, Show, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {Key} from '@solid-primitives/keyed'
import XIcon from 'lucide-solid/icons/x'
import {Button, TooltipIconButton, TruncatedText} from '@conciv/ui-kit-system'
import {useComposerContext} from '@conciv/ui-kit-chat'
import {NoteCard, type ComposerNote, type IconName, type MountedSession} from '@conciv/plugin/experimental'
import {usePluginHost} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {icons} from '../runtime/plugin/icons'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {NoteContextItem, type NoteComment} from './note-schema'
import {readPromptPresentation} from './comment-note'

const FALLBACK_ICON: IconName = 'message-square'
const SENT_NOTE_BOUND = 5

const CARD =
  'flex flex-col justify-center gap-0.5 h-14 px-2.5 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)]'
const STAGED_CARD = `${CARD} min-w-24 max-w-56`
const SENT_CARD = `${CARD} w-full`
const HEADING = 'block truncate text-[length:var(--chat-text-sm)] [color:var(--chat-text-hi)]'
const META = 'flex items-center gap-1 min-w-0 text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]'

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

function NoteChip(props: {note: NoteComment; wide?: boolean}): JSX.Element {
  return (
    <div class={props.wide ? SENT_CARD : STAGED_CARD}>
      <TruncatedText class={HEADING} text={noteHeading(props.note)} />
      <span class={META}>
        <Dynamic component={icons[noteIcon(props.note.icon)]} size={12} class="shrink-0" aria-hidden="true" />
        <TruncatedText class="block truncate" text={noteSubtitle(props.note)} />
      </span>
    </div>
  )
}

function PluginNoteCard(props: {note: ComposerNote; session: MountedSession | undefined}): JSX.Element {
  const host = usePluginHost()
  const [state, setState] = createStore({declined: false})
  const decline = () => setState('declined', true)
  const claimant = createMemo(() =>
    state.declined ? undefined : host.items(NoteCard).find((item) => item.value.origins.includes(props.note.origin)),
  )

  return (
    <Show when={claimant()} keyed fallback={<NoteChip note={props.note} />}>
      {(item) => (
        <Contribution plugin={item.plugin} failed={decline}>
          {() => {
            const drawn = item.value.render({
              get note() {
                return props.note
              },
              get session() {
                return props.session
              },
            })

            if (drawn === undefined || drawn === null) queueMicrotask(decline)

            return drawn
          }}
        </Contribution>
      )}
    </Show>
  )
}

export function ComposerNotes(props: {session: Accessor<MountedSession | undefined>; onRemoved: () => void}) {
  const context = useComposerContext()
  const notes = createMemo(() =>
    context.items().flatMap((item) => {
      const note = NoteContextItem.safeParse(item.value)

      return note.success ? [{key: item.key, note: {...note.data, icon: noteIcon(note.data.icon)}}] : []
    }),
  )
  const remove = (key: string) => {
    context.removeItem(key)
    props.onRemoved()
  }

  return (
    <Show when={notes().length > 0}>
      <ul aria-label="Notes" class="flex flex-wrap gap-1 list-none p-0">
        <Key each={notes()} by={(entry) => entry.key}>
          {(entry) => (
            <li class="flex items-center gap-0.5 min-w-0 anim-presence-in">
              <PluginNoteCard note={entry().note} session={props.session()} />
              <TooltipIconButton tooltip={`Remove ${noteHeading(entry().note)}`} onClick={() => remove(entry().key)}>
                <XIcon size={12} aria-hidden="true" />
              </TooltipIconButton>
            </li>
          )}
        </Key>
      </ul>
    </Show>
  )
}

export function SentNotes(props: {messages: Accessor<readonly ChatMessage[]>; bounded: boolean}): JSX.Element {
  const [state, setState] = createStore({expanded: false})
  const notes = createMemo(() =>
    props.messages().flatMap((message) => readPromptPresentation(message.metadata)?.comments ?? []),
  )
  const collapsed = () => props.bounded && !state.expanded
  const shown = createMemo(() => (collapsed() ? notes().slice(0, SENT_NOTE_BOUND) : notes()))

  return (
    <Show when={notes().length > 0}>
      <div class="flex flex-col items-start gap-2 w-full max-w-80">
        <ul aria-label="Notes on this message" class="flex flex-col gap-2 w-full list-none p-0">
          <For each={shown()}>
            {(note) => (
              <li>
                <NoteChip note={note} wide />
              </li>
            )}
          </For>
        </ul>
        <Show when={collapsed() && notes().length > SENT_NOTE_BOUND}>
          <Button variant="ghost" size="sm" onClick={() => setState('expanded', true)}>
            Show more
          </Button>
        </Show>
      </div>
    </Show>
  )
}
