import {Show} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {AlertOptions, ConfirmOptions, PromptOptions} from '@conciv/plugin/experimental'
import {Dialog, TextField} from '@conciv/ui-kit-system'
import {ui} from './ui'

const FOOTER = 'flex justify-end gap-2'

function TitleGroup(props: {title: string; description?: string}) {
  return (
    <Dialog.Header>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <Dialog.Title>{props.title}</Dialog.Title>
        <Show when={props.description}>
          <Dialog.Description class="m-0 text-chat-xs text-chat-text-2">{props.description}</Dialog.Description>
        </Show>
      </div>
    </Dialog.Header>
  )
}

export function PluginConfirmDialog(props: {options: ConfirmOptions; done: (confirmed: boolean) => void}) {
  return (
    <Dialog.Content size="md">
      <TitleGroup title={props.options.title} description={props.options.description} />
      <Dialog.Footer class={`pt-4 ${FOOTER}`}>
        <ui.Button variant="ghost" autofocus={!!props.options.danger} onClick={() => props.done(false)}>
          {props.options.cancel ?? 'Cancel'}
        </ui.Button>
        <ui.Button
          variant={props.options.danger ? 'danger' : 'contrast'}
          autofocus={!props.options.danger}
          onClick={() => props.done(true)}
        >
          {props.options.confirm ?? 'Confirm'}
        </ui.Button>
      </Dialog.Footer>
    </Dialog.Content>
  )
}

export function PluginAlertDialog(props: {options: AlertOptions; done: () => void}) {
  return (
    <Dialog.Content size="md">
      <TitleGroup title={props.options.title} description={props.options.description} />
      <Dialog.Footer class={`pt-4 ${FOOTER}`}>
        <ui.Button variant="contrast" autofocus onClick={() => props.done()}>
          {props.options.ok ?? 'OK'}
        </ui.Button>
      </Dialog.Footer>
    </Dialog.Content>
  )
}

export function PluginPromptDialog(props: {options: PromptOptions; done: (value: string | undefined) => void}) {
  const [store, setStore] = createStore({value: props.options.value ?? '', selected: false})

  return (
    <Dialog.Content size="md">
      <TitleGroup title={props.options.title} description={props.options.description} />
      <form
        class="contents"
        onSubmit={(event) => {
          event.preventDefault()

          if (store.value) props.done(store.value)
        }}
      >
        <Dialog.Body>
          <TextField
            type={props.options.secret ? 'password' : 'text'}
            size="lg"
            value={store.value}
            placeholder={props.options.placeholder}
            aria-label={props.options.title}
            autofocus
            autocomplete="off"
            spellcheck={false}
            onFocus={(event) => {
              if (store.selected) return
              setStore('selected', true)
              event.currentTarget.select()
            }}
            onInput={(event) => setStore('value', event.currentTarget.value)}
          />
        </Dialog.Body>
        <Dialog.Footer class={FOOTER}>
          <ui.Button type="button" variant="ghost" onClick={() => props.done(undefined)}>
            Cancel
          </ui.Button>
          <ui.Button type="submit" variant="contrast" disabled={!store.value}>
            {props.options.submit ?? 'Submit'}
          </ui.Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  )
}
