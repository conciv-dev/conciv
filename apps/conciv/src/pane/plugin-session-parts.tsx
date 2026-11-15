import {createMemo, onCleanup, Show, type Accessor, type JSX, type ParentProps} from 'solid-js'
import {useComposer} from '@conciv/ui-kit-chat'
import type {MountedSession, SessionScreen} from '@conciv/plugin/experimental'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query'
import {usePluginAttachment} from '../runtime/plugin/attachment'
import {usePluginHost} from '../runtime/plugin/host'
import {PluginLinks, PluginSlot} from '../runtime/plugin/render'
import type {ComposerInputHandle} from './composer-input-adapter'

export type PaneSession = ReturnType<typeof createPaneSession>

export function createPaneSession(sessionId: string) {
  const attachment = usePluginAttachment()
  const host = usePluginHost()

  const view = createMemo(() => {
    const current = attachment.current()

    return current?.id === sessionId ? current : undefined
  })
  const binder = createMemo(() => {
    const current = attachment.composer()

    return current?.sessionId() === sessionId ? current : undefined
  })

  return {ready: host.ready, screen: attachment.shownScreen, view, binder}
}

function SessionParts(props: {
  pane: PaneSession
  children: (view: Accessor<MountedSession>, screen: SessionScreen) => JSX.Element
}) {
  return (
    <Show when={props.pane.ready() ? props.pane.view() : undefined}>
      {(view) => (
        <Show when={props.pane.screen()} keyed>
          {(screen) => props.children(view, screen)}
        </Show>
      )}
    </Show>
  )
}

export function SessionHeaderSlot(props: {pane: PaneSession}) {
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)

  return (
    <SessionParts pane={props.pane}>
      {(view, screen) => (
        <PluginSlot
          at="session.header"
          input={{
            get session() {
              return view()
            },
            screen,
            active: true,
            get compact() {
              return phone()
            },
          }}
        />
      )}
    </SessionParts>
  )
}

export function SessionStatusSlot(props: {pane: PaneSession}) {
  return (
    <SessionParts pane={props.pane}>
      {(view, screen) => (
        <PluginSlot
          at="session.status"
          input={{
            get session() {
              return view()
            },
            screen,
          }}
        />
      )}
    </SessionParts>
  )
}

export function SessionLinks(props: ParentProps<{pane: PaneSession}>) {
  return <PluginLinks session={props.pane.view()}>{props.children}</PluginLinks>
}

export function SessionComposerBinding(props: {
  pane: PaneSession
  input: Accessor<ComposerInputHandle | undefined>
  focus: () => void
  restored: Promise<unknown>
}) {
  return (
    <Show when={props.pane.binder()} keyed>
      {(binder) => {
        const composer = useComposer()

        onCleanup(
          binder.bind({
            composer: {text: composer.text, setText: composer.setText},
            input: props.input,
            prompt: {quotable: () => false, focus: props.focus, focused: () => false},
          }),
        )
        binder.bindDraft(props.restored)

        return null
      }}
    </Show>
  )
}
