import {
  batch,
  createMemo,
  createEffect,
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
import type {Composer, MountedSession, SessionScreen} from '@conciv/plugin/experimental'
import {useQuery} from '@conciv/client'
import {useAppData, useConnected} from '../../app/context'
import type {ComposerInputHandle} from '../../pane/composer-input-adapter'
import {usePluginAttachment} from './attachment'
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
}

type MountedSessionInput = {
  readonly id: Accessor<string>
  readonly composer: {readonly text: Accessor<string>; readonly setText: (value: string) => void}
  readonly input: Accessor<ComposerInputHandle | undefined>
}

export function createMountedSession(session: MountedSessionInput) {
  const appData = useAppData()
  const connection = useConnected()
  const attachment = usePluginAttachment()
  const engine = attachment.engine
  const listed = useQuery(() => ({...appData.utils.tabs.list.queryOptions(), enabled: connection()}))
  const [prompt, setPrompt] = createSignal<{quotable: Accessor<boolean>; focus: () => void; focused: () => boolean}>()

  const insertAtCaret = (text: string) => {
    const handle = session.input()

    if (!handle) throw new Error('The composer input is not ready')
    handle.insert(text)
  }

  const composer = createMemo(() => {
    const target: ComposerTarget = {
      sessionId: session.id(),
      text: session.composer.text,
      setText: session.composer.setText,
      insert: insertAtCaret,
    }
    const draft = Promise.withResolvers<void>()
    const [loaded] = createResource(() => draft.promise)

    return {target, ready: () => loaded.state === 'ready', draft}
  })

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

  const runWrite = (effect: ComposerWriteEffect<ComposerTarget>) => {
    if (effect.type === 'apply') return effect.write(effect.target)

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
    attach: (part) => console.error('[plugin] Composer.attach is not implemented yet', part.type),
    quotable: undefined,
    focus(commentId) {
      if (commentId === undefined) return prompt()?.focus()
    },
    update: undefined,
    detach: undefined,
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
      location: {directory},
      directory,
      local: undefined,
    })

    return view
  }

  const screen: SessionScreen = Object.freeze({composer: composerRef})

  const owner = getOwner()
  const root: ObjectRoot = {}

  onCleanup(() => root.dispose?.())

  const mounted = createMemo<MountedSession | undefined>((previous) => {
    const id = session.id()
    const directory = listed.data?.project.root
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
  createEffect(() =>
    batch(() => {
      onCleanup(attachment.screen(screen))
      onCleanup(attachment.mount(mounted))
    }),
  )

  return {
    screen,
    view: mounted,
    bindPrompt: (value: {quotable: Accessor<boolean>; focus: () => void; focused: () => boolean}) =>
      setPrompt(() => value),
    bindDraft: (ready: Promise<void>) => untrack(composer).draft.resolve(ready),
  }
}
