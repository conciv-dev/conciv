import type {PluginInfo} from '@conciv/plugin'
import {z} from 'zod'
import {createMemo, createSignal, createUniqueId, For, Show} from 'solid-js'
import {Button, Switch} from '@conciv/ui-kit-system'
import Box from 'lucide-solid/icons/box'
import {pluginLabel} from './plugin-label'
import {ActionRow, Badge, Group} from '../../settings/settings-ui'
import {useNotices} from '../../shell/notice-context'
import {usePluginHost} from './host'
import {usePluginManager, useReservedPlugins} from './root'

const NotFoundSchema = z.object({code: z.literal('notFound')})

const STATUS = 'text-chat-xs text-chat-text-2'
const NOTE = `m-0 ${STATUS}`
const FAILURE = 'm-0 font-chat-mono text-chat-xs text-chat-danger whitespace-pre-wrap break-words'

type PluginRows = ReturnType<typeof createPluginRows>

function createPluginRows(plugins: () => readonly PluginInfo[]) {
  const host = usePluginHost()
  const reserved = useReservedPlugins()

  const listed = createMemo(() => plugins().filter((plugin) => plugin.source.type !== 'builtin'))

  const itemOf = (id: string) => host.installed().find((item) => item.id === id && !item.builtin)

  const unnamed = createMemo(() => {
    const named = new Set(listed().flatMap((plugin) => (plugin.id ? [plugin.id] : [])))

    return [
      ...new Set([
        ...host.definitions().map((definition) => definition.id),
        ...host.installed().flatMap((item) => (item.builtin ? [] : [item.id])),
        ...reserved(),
      ]),
    ].filter((id) => !named.has(id))
  })

  const errorOf = (id: string) => host.failure(id)?.error ?? itemOf(id)?.error

  return {listed, unnamed, itemOf, errorOf}
}

export function ExtensionPlugins(props: {plugins: readonly PluginInfo[]}) {
  return <OwnServerPlugins rows={createPluginRows(() => props.plugins)} />
}

function OwnServerPlugins(props: {rows: PluginRows}) {
  const notices = useNotices()
  const host = usePluginHost()
  const plugins = usePluginManager()
  const reserved = useReservedPlugins()

  const defined = (id: string) => host.definitions().some((definition) => definition.id === id)

  const kind = (id: string | undefined) => {
    if (!id) return undefined

    if (reserved().includes(id)) return 'reserved'
    const item = props.rows.itemOf(id)

    if (item?.error !== undefined && !defined(id)) return 'unreadable'

    if (item || defined(id)) return 'loaded'

    return undefined
  }

  const status = (id: string) => {
    const value = host.status(id) ?? 'loading'

    if (value === 'failed' || (value === 'active' && props.rows.itemOf(id)?.error)) return 'Failed'

    if (value === 'active' || value === 'disabled') return undefined

    return 'Loading'
  }

  const run = (work: Promise<void> | undefined) =>
    void work?.catch((cause: unknown) =>
      notices.notify(NotFoundSchema.safeParse(cause).success ? 'Plugin not found' : 'Request failed', {
        tone: 'danger',
      }),
    )

  const toggle = (id: string, next: boolean) => run(next ? plugins()?.enable(id) : plugins()?.disable(id))

  const reload = (id: string) => {
    host.reload(id)
    run(plugins()?.reload(id))
  }

  const row = (input: {id: string | undefined; name: string; plugin?: PluginInfo}) => {
    const state = () => kind(input.id)
    const live = () => (state() === 'loaded' ? input.id : undefined)
    const failure = () => {
      const listedState = input.plugin?.state
      return listedState?.status === 'failed' ? listedState : undefined
    }
    const label = () => {
      const id = live()
      if (failure()) return 'Failed'
      return id ? status(id) : undefined
    }
    const error = () => {
      const id = input.id
      if (id && live()) return props.rows.errorOf(id) ?? failure()?.error
      if (id && state() === 'unreadable') return props.rows.itemOf(id)?.error ?? failure()?.error
      return failure()?.error
    }

    return (
      <ActionRow
        leading={<Box class="size-3.75 shrink-0 text-chat-text-2" aria-hidden="true" />}
        label={
          <>
            <bdi dir="ltr" class="min-w-0 truncate">
              {input.name}
            </bdi>
            <Show when={live()}>
              {(id) => (
                <Show when={props.rows.itemOf(id())?.server}>
                  <Badge>Server</Badge>
                </Show>
              )}
            </Show>
            <Show when={label()}>{(text) => <span class={STATUS}>{text()}</span>}</Show>
          </>
        }
        hint={
          <>
            <Show when={error()}>{(text) => <PluginError error={text()} />}</Show>
            <Show when={state() === 'reserved'}>
              <span class="text-chat-danger">Not loaded. A built-in plugin already uses this ID.</span>
            </Show>
          </>
        }
      >
        <Show when={live()}>
          {(id) => (
            <div class="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => reload(id())}>
                Reload
              </Button>
              <Switch.Root
                checked={props.rows.itemOf(id())?.enabled ?? true}
                onCheckedChange={(details) => toggle(id(), details.checked)}
              >
                <Switch.Label class="sr-only">{id()}</Switch.Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.HiddenInput />
              </Switch.Root>
            </div>
          )}
        </Show>
      </ActionRow>
    )
  }

  return (
    <>
      <Group>
        <For each={props.rows.listed()}>{(plugin) => row({id: plugin.id, name: pluginLabel(plugin), plugin})}</For>
        <For each={props.rows.unnamed()}>{(id) => row({id, name: id})}</For>
      </Group>
      <Show when={host.installed().some((item) => !item.builtin)}>
        <p class={NOTE}>
          Switches turn off only a plugin's page UI. Add "-&lt;id&gt;" to the plugins option of conciv() in your build
          config to turn off its server part.
        </p>
      </Show>
    </>
  )
}

function PluginError(props: {error: string}) {
  const id = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const message = () => props.error.split('\n', 1)[0]
  const more = () => props.error.trimEnd().includes('\n')

  return (
    <div class="flex min-w-0 flex-col items-start gap-1">
      <pre id={id} class={FAILURE}>
        {open() || !more() ? props.error : message()}
      </pre>
      <Show when={more()}>
        <Button
          size="sm"
          variant="plain"
          aria-expanded={open()}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {open() ? 'Hide details' : 'Show details'}
        </Button>
      </Show>
    </div>
  )
}
