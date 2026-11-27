import type {PluginInfo} from '@conciv/client'
import {EvlogError} from 'evlog'
import {createMemo, createSignal, createUniqueId, For, Show} from 'solid-js'
import {Button, Switch} from '@conciv/ui-kit-system'
import Box from 'lucide-solid/icons/box'
import {pluginLabel} from './plugin-label'
import {ActionRow, Group} from '@internal/frontend-app-api/plugin/settings-layout'
import {Badge} from '../../settings/settings-ui'
import {useNotices} from '../../shell/notice-context'
import {usePluginHost} from '@internal/frontend-app-api/plugin/host'
import {pluginErrors} from '@internal/frontend-app-api/plugin/errors'
import {errorFix} from '../../shell/rpc-error-message'
import {useBuiltinPlugin, usePluginManager, useReservedPlugins} from './root'

const STATUS = 'text-chat-xs text-chat-text-2'
const NOTE = `m-0 ${STATUS}`
const FAILURE = 'm-0 font-chat-mono text-chat-xs text-chat-danger whitespace-pre-wrap break-words'

type PluginRows = ReturnType<typeof createPluginRows>

function createPluginRows(plugins: () => readonly PluginInfo[]) {
  const host = usePluginHost()
  const reserved = useReservedPlugins()

  const listed = createMemo(() => plugins().filter((plugin) => plugin.source.type !== 'builtin'))

  const builtin = useBuiltinPlugin()

  const itemOf = (id: string, kind: 'builtin' | 'config') =>
    host.installed().find((item) => item.id === id && item.builtin === (kind === 'builtin'))

  const unnamed = createMemo(() => {
    const named = new Set(listed().flatMap((plugin) => (plugin.id ? [plugin.id] : [])))

    return [
      ...new Set([
        ...host.definitions().flatMap((definition) => (builtin(definition.id) ? [] : [definition.id])),
        ...host.installed().flatMap((item) => (item.builtin ? [] : [item.id])),
        ...reserved(),
      ]),
    ].filter((id) => !named.has(id))
  })

  const errorOf = (id: string, kind: 'builtin' | 'config') => host.failure(id)?.error ?? itemOf(id, kind)?.error

  const fixOf = (id: string | undefined) => (id ? host.failure(id)?.fix : undefined)

  const failedBuiltins = createMemo(() =>
    host
      .definitions()
      .flatMap((definition) =>
        builtin(definition.id) && errorOf(definition.id, 'builtin') !== undefined ? [definition.id] : [],
      ),
  )

  return {listed, unnamed, failedBuiltins, builtin, itemOf, errorOf, fixOf}
}

export function ExtensionPlugins(props: {plugins: readonly PluginInfo[]}) {
  return <OwnServerPlugins rows={createPluginRows(() => props.plugins)} />
}

function OwnServerPlugins(props: {rows: PluginRows}) {
  const notices = useNotices()
  const host = usePluginHost()
  const plugins = usePluginManager()
  const reserved = useReservedPlugins()

  const defined = (id: string) =>
    !props.rows.builtin(id) && host.definitions().some((definition) => definition.id === id)

  const kind = (id: string | undefined) => {
    if (!id) return undefined

    if (reserved().includes(id)) return 'reserved'
    const item = props.rows.itemOf(id, 'config')

    if (item?.error !== undefined && !defined(id)) return 'unreadable'

    if (item || defined(id)) return 'loaded'

    return undefined
  }

  const status = (id: string, part: 'builtin' | 'config') => {
    const value = host.status(id) ?? 'loading'

    if (value === 'failed' || (value === 'active' && props.rows.itemOf(id, part)?.error)) return 'Failed'

    if (value === 'active' || value === 'disabled') return undefined

    return 'Loading'
  }

  const run = (work: Promise<void> | undefined) =>
    void work?.catch((cause: unknown) =>
      notices.notify(pluginNotFound(cause) ? 'Plugin not found' : 'Request failed', {
        tone: 'danger',
        description: errorFix(cause),
      }),
    )

  const toggle = (id: string, next: boolean) => run(next ? plugins()?.enable(id) : plugins()?.disable(id))

  const reload = (id: string) => {
    host.reload(id)
    run(plugins()?.reload(id))
  }

  const row = (input: {id: string | undefined; name: string; builtin?: boolean; plugin?: PluginInfo}) => {
    const state = () => (input.builtin ? 'loaded' : kind(input.id))
    const part = input.builtin ? 'builtin' : 'config'
    const live = () => (state() === 'loaded' ? input.id : undefined)
    const failure = () => {
      const listedState = input.plugin?.state
      return listedState?.status === 'failed' ? listedState : undefined
    }
    const label = () => {
      const id = live()
      if (failure()) return 'Failed'
      return id ? status(id, part) : undefined
    }
    const error = () => {
      const id = input.id
      if (id && live()) return props.rows.errorOf(id, part) ?? failure()?.error
      if (id && state() === 'unreadable') return props.rows.itemOf(id, part)?.error ?? failure()?.error
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
                <>
                  <Show when={input.builtin}>
                    <Badge>Built-in</Badge>
                  </Show>
                  <Show when={props.rows.itemOf(id(), part)?.server}>
                    <Badge>Server</Badge>
                  </Show>
                </>
              )}
            </Show>
            <Show when={label()}>{(text) => <span class={STATUS}>{text()}</span>}</Show>
          </>
        }
        hint={
          <>
            <Show when={error()}>{(text) => <PluginError error={text()} fix={props.rows.fixOf(live())} />}</Show>
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
              <Show when={!input.builtin} fallback={<span class="w-8 shrink-0" aria-hidden="true" />}>
                <Switch.Root
                  checked={props.rows.itemOf(id(), part)?.enabled ?? true}
                  onCheckedChange={(details) => toggle(id(), details.checked)}
                >
                  <Switch.Label class="sr-only">{id()}</Switch.Label>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.HiddenInput />
                </Switch.Root>
              </Show>
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
        <For each={props.rows.failedBuiltins()}>{(id) => row({id, name: id, builtin: true})}</For>
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

function pluginNotFound(cause: unknown): boolean {
  return EvlogError.isEvlogError(cause) && cause.code === pluginErrors.NOT_FOUND.code
}

function PluginError(props: {error: string; fix: string | undefined}) {
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
      <Show when={props.fix}>{(text) => <p class={NOTE}>{text()}</p>}</Show>
    </div>
  )
}
