import {createMemo, For, Show} from 'solid-js'
import {createStore} from 'solid-js/store'
import fuzzysort from 'fuzzysort'
import type {AlertOptions, ConfirmOptions, PromptOptions, SelectOptions} from '@conciv/plugin/experimental'
import {
  createListCollection,
  Dialog,
  Highlight,
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_MESSAGE,
  Listbox,
  TextField,
} from '@conciv/ui-kit-system'
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

export function PluginSelectDialog<T>(props: {options: SelectOptions<T>; done: (value: T | undefined) => void}) {
  const [store, setStore] = createStore({query: ''})

  const rows = createMemo(() =>
    props.options.options.map((option, index) => ({
      key: String(index),
      option,
      title: option.title,
      description: option.description ?? '',
    })),
  )

  const results = createMemo(() => {
    const query = store.query.trim()

    if (!query) return rows()

    return fuzzysort.go(query, rows(), {keys: ['title', 'description']}).map((result) => result.obj)
  })

  const collection = createMemo(() =>
    createListCollection({
      items: results(),
      itemToValue: (row) => row.key,
      itemToString: (row) => row.title,
      groupBy: (row) => row.option.group ?? '',
    }),
  )

  const current = rows().find((row) => row.option.value === props.options.current) ?? rows()[0]

  return (
    <Dialog.Content size="lg">
      <Dialog.Title class="sr-only">{props.options.title}</Dialog.Title>
      <Dialog.Body class="flex flex-col gap-2">
        <Listbox.Root
          collection={collection()}
          value={[]}
          defaultHighlightedValue={current?.key ?? null}
          loopFocus
          onSelect={(details) => {
            const row = collection().find(details.value)

            if (row) props.done(row.option.value)
          }}
        >
          <Listbox.Context>
            {(listbox) => (
              <>
                <Listbox.Label class="sr-only">{props.options.title}</Listbox.Label>
                <TextField
                  {...listbox().getInputProps({autoHighlight: true})}
                  size="lg"
                  value={store.query}
                  placeholder={props.options.placeholder ?? 'Search'}
                  aria-label={props.options.title}
                  autofocus
                  onInput={(event) => setStore('query', event.currentTarget.value)}
                />
                <Listbox.Content class="max-h-80 overflow-y-auto overscroll-contain">
                  <For each={collection().group()}>
                    {([group, items]) => (
                      <Listbox.ItemGroup>
                        <Show when={group}>
                          <Listbox.ItemGroupLabel class={LIST_PANEL_GROUP_LABEL}>{group}</Listbox.ItemGroupLabel>
                        </Show>
                        <For each={items}>
                          {(row) => (
                            <Listbox.Item
                              item={row}
                              highlightOnHover
                              data-active={listbox().highlightedValue === row.key ? '' : undefined}
                              class="data-[active]:bg-chat-fill-strong"
                            >
                              <span class="flex min-w-0 flex-1 flex-col">
                                <Listbox.ItemText class="truncate text-chat-text-hi" dir="auto">
                                  <Highlight text={row.title} query={store.query.trim()} ignoreCase />
                                </Listbox.ItemText>
                                <Show when={row.description}>
                                  {(description) => (
                                    <span class="truncate text-chat-xs text-chat-text-2" dir="auto">
                                      <Highlight text={description()} query={store.query.trim()} ignoreCase />
                                    </span>
                                  )}
                                </Show>
                              </span>
                            </Listbox.Item>
                          )}
                        </For>
                      </Listbox.ItemGroup>
                    )}
                  </For>
                </Listbox.Content>
                <Show when={collection().size === 0}>
                  <p role="status" class={LIST_PANEL_MESSAGE}>
                    No results found
                  </p>
                </Show>
              </>
            )}
          </Listbox.Context>
        </Listbox.Root>
      </Dialog.Body>
    </Dialog.Content>
  )
}
