import {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createRoot,
  createSignal,
  getOwner,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from 'solid-js'
import type {Composer, MountedSession, SessionScreen} from '@conciv/frontend-plugin-api'
import type {DraftItem} from '@conciv/types/chat-types'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import {useQuery} from '@conciv/client'
import {useAppData, useConnected, useLiveSessions} from '../../app/context'
import {usePluginAttachment} from './attachment'
import {decodeNotes, NoteContextItem, noteItem, noteValue} from '../../composer/note-schema'
import type {ComposerBinding} from './host-apis'
import {editDraft, type SavedDraft} from '../../pane/draft-storage'
import {
  createComposerWriteState,
  transitionComposerWrite,
  type ComposerWriteEffect,
  type ComposerWriteEvent,
} from './composer-write-machine'

type ObjectRoot = {dispose?: () => void}

type ComposerTarget = {
  readonly sessionId: string
  readonly text: Accessor<string>
  readonly setText: (value: string) => void
  readonly insert: (text: string) => void
  readonly items: Accessor<DraftItem[]>
  readonly addItem: (item: DraftItem) => void
  readonly updateItem: (key: string, value: DraftItem['value']) => void
  readonly removeItem: (key: string) => void
}

const commentNotes = (items: readonly DraftItem[], commentId: string) =>
  decodeNotes(items).filter((entry) => entry.note.commentId === commentId)

type BoundComposer = {readonly sessionId: string; readonly binding: ComposerBinding}

function editSavedDraft(saved: SavedDraft, sessionId: string, change: (draft: ComposerTarget) => void): SavedDraft {
  const edited = {draft: saved}
  const place = (text: string, caret: number) => {
    edited.draft = {...edited.draft, text, selection: {start: caret, end: caret}}
  }
  const setItems = (items: readonly DraftItem[]) => {
    edited.draft = {...edited.draft, items}
  }

  change({
    sessionId,
    text: () => edited.draft.text,
    setText: (value) => place(value, value.length),
    insert(text) {
      const {start, end} = edited.draft.selection

      place(edited.draft.text.slice(0, start) + text + edited.draft.text.slice(end), start + text.length)
    },
    items: () => [...edited.draft.items],
    addItem(item) {
      if (!edited.draft.items.some((entry) => entry.key === item.key)) setItems([...edited.draft.items, item])
    },
    updateItem: (key, value) => setItems(edited.draft.items.map((entry) => (entry.key === key ? {key, value} : entry))),
    removeItem: (key) => setItems(edited.draft.items.filter((entry) => entry.key !== key)),
  })

  return edited.draft
}

type ComposerSlot = {
  readonly target: ComposerTarget
  readonly draft: PromiseWithResolvers<unknown>
  readonly ready: Accessor<boolean>
}

export function createMountedSession(session: {readonly id: Accessor<string>}) {
  const appData = useAppData()
  const connection = useConnected()
  const liveSessions = useLiveSessions()
  const attachment = usePluginAttachment()
  const engine = attachment.engine
  const listed = useQuery(() => ({...appData.utils.tabs.list.queryOptions(), enabled: connection()}))
  const owner = getOwner()
  const [binding, setBinding] = createSignal<BoundComposer>()
  const bound = createMemo(() => binding() !== undefined)

  const shown = (sessionId: string) => {
    const value = binding()

    return value?.sessionId === sessionId ? value.binding : undefined
  }

  const shownFor = (sessionId: string) => {
    const value = untrack(() => shown(sessionId))

    if (!value) throw new Error('The composer is not shown')

    return value
  }

  const createSlot = (sessionId: string): ComposerSlot => {
    const draft = Promise.withResolvers<unknown>()
    const [loaded] = createResource(() => draft.promise)

    return {
      target: {
        sessionId,
        text: () => shown(sessionId)?.composer.text() ?? '',
        setText: (value) => shownFor(sessionId).composer.setText(value),
        insert(text) {
          const handle = shownFor(sessionId).input()

          if (!handle) throw new Error('The composer input is not ready')
          handle.insert(text)
        },
        items: () => shown(sessionId)?.composer.items() ?? [],
        addItem: (item) => shownFor(sessionId).composer.addItem(item),
        updateItem: (key, value) => shownFor(sessionId).composer.updateItem(key, value),
        removeItem: (key) => shownFor(sessionId).composer.removeItem(key),
      },
      draft,
      ready: () => loaded.state === 'ready',
    }
  }

  const composer = createMemo(
    on([session.id, bound], ([sessionId, isBound], _, previous?: ComposerSlot) => {
      if (previous && isBound && previous.target.sessionId === sessionId) return previous

      previous?.draft.resolve(undefined)

      return createRoot(() => createSlot(sessionId), owner)
    }),
  )

  const writes = {state: createComposerWriteState<ComposerTarget>()}
  const queue: ComposerWriteEvent<ComposerTarget>[] = []

  const dispatchWrite = (event: ComposerWriteEvent<ComposerTarget>) => {
    queue.push(event)

    if (queue.length === 1) untrack(drainWrites)
  }

  const drainWrites = () => {
    const event = queue[0]

    if (!event) return

    try {
      const next = transitionComposerWrite(writes.state, event)

      writes.state = next.state
      next.effects.forEach((effect) =>
        Promise.try(() => runWrite(effect)).catch((cause: unknown) =>
          console.error('[plugin] Composer write failed', cause),
        ),
      )
    } finally {
      queue.shift()
    }

    drainWrites()
  }

  const apply = (target: ComposerTarget, change: (draft: ComposerTarget) => void) => {
    if (untrack(() => shown(target.sessionId))) return change(target)

    if (!untrack(binding) && untrack(composer).target.sessionId === target.sessionId) return write(change)

    return editDraft(appData, liveSessions.keepDraft, target.sessionId, (saved) =>
      editSavedDraft(saved, target.sessionId, change),
    )
  }

  const runWrite = (effect: ComposerWriteEffect<ComposerTarget>) => {
    if (effect.type === 'apply') return apply(effect.target, effect.write)

    if (effect.type === 'drain') return dispatchWrite({type: 'drain.next', target: effect.target})

    if (effect.type === 'observe')
      return void effect.load.then(
        () => batch(() => dispatchWrite({type: 'loaded', target: effect.target})),
        (cause: unknown) => dispatchWrite({type: 'failed', target: effect.target, cause}),
      )

    console.error('[plugin] Composer draft load failed', effect.cause)
  }

  onCleanup(() => dispatchWrite({type: 'disposed'}))

  const write = (apply: (draft: ComposerTarget) => void) => {
    const current = untrack(composer)

    dispatchWrite({
      type: 'write',
      target: current.target,
      load: current.ready() ? undefined : current.draft.promise,
      write: apply,
    })
  }

  const composerRef: Composer = {
    text: () => composer().target.text(),
    insert(text) {
      const value = text.replace(/\r\n?/g, '\n')

      if (value) write((draft) => draft.insert(value))
    },
    setText: (value) => write((draft) => draft.setText(value.replace(/\r\n?/g, '\n'))),
    model: () => undefined,
    setModel: () => false,
    setVariant: () => false,
    attach(part) {
      if (part.type !== 'note') {
        console.error('[plugin] Composer.attach is not implemented yet', part.type)
        return
      }

      const item = noteItem(NoteContextItem.parse(part))

      write((draft) => draft.addItem(item))
    },
    quotable: undefined,
    focus(commentId) {
      if (commentId === undefined) return binding()?.binding.prompt.focus()
    },
    update(id, patch) {
      const comment = patch.comment

      if (comment === undefined) return

      write((draft) =>
        commentNotes(draft.items(), id).forEach((entry) =>
          draft.updateItem(entry.key, noteValue({...entry.note, comment})),
        ),
      )
    },
    detach: (id) => write((draft) => commentNotes(draft.items(), id).forEach((entry) => draft.removeItem(entry.key))),
    focused: undefined,
  }

  const create = (input: {id: string; directory: string; tab: string; visit: object}): MountedSession => {
    const id = input.id
    const directory = input.directory

    const view: MountedSession = Object.freeze({
      key: `${engine.id}\n${id}`,
      id,
      tab: input.tab,
      visit: input.visit,
      server: engine,
      pending: false,
      location: {directory: AbsolutePath.make(directory)},
      directory,
      local: undefined,
      run: Object.freeze({
        status: () => (liveSessions.runLive(id) ? 'running' : 'idle'),
        interrupt() {
          const interrupted = untrack(() => liveSessions.runLive(id))

          if (interrupted) liveSessions.stop(id)

          return Promise.resolve({interrupted})
        },
      }),
    })

    return view
  }

  const screen: SessionScreen = Object.freeze({composer: composerRef})

  const root: ObjectRoot = {}

  onCleanup(() => root.dispose?.())

  const mounted = createMemo<MountedSession | undefined>((previous) => {
    const id = session.id()
    const directory = listed.isSuccess ? listed.data?.project.root : undefined
    const tab = id

    if (directory === undefined) return

    if (previous && previous.id === id && previous.directory === directory && previous.tab === tab) return previous

    const visit = previous?.id === id ? previous.visit : {}

    return untrack(() =>
      createRoot((dispose) => {
        root.dispose?.()
        root.dispose = dispose

        return create({id, directory, tab, visit})
      }, owner),
    )
  })

  createRenderEffect(
    on(mounted, (view) => {
      if (view) attachment.preload(view)
    }),
  )
  const binder = {
    sessionId: session.id,
    bind(value: ComposerBinding) {
      const entry = {sessionId: untrack(session.id), binding: value}

      setBinding(entry)

      return () => {
        if (untrack(binding) === entry) setBinding(undefined)
      }
    },
    bindDraft: (ready: Promise<unknown>) => untrack(composer).draft.resolve(ready),
  }

  createEffect(() =>
    batch(() => {
      onCleanup(attachment.screen(screen))
      onCleanup(attachment.mount(mounted))
      onCleanup(attachment.bindComposer(binder))
    }),
  )

  return {screen, view: mounted}
}
