import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {RelativeTime} from '@conciv/ui-kit-system'
import {CardNote, CardRow, CardRows, InspectionCard, JsonValue} from './card-shared.js'

const EntrySchema = z
  .object({
    key: z.string(),
    state: z.string().default('fresh'),
    status: z.string().nullable().default(null),
    observers: z.number().nullable().default(null),
    updatedAt: z.number().nullable().default(null),
    value: z.unknown(),
  })
  .loose()

const QueryCacheSchema = z.object({
  queries: z.array(EntrySchema).default([]),
  mutations: z.array(EntrySchema).default([]),
})

type Entry = z.infer<typeof EntrySchema>

function parseCache(result: ToolCardProps['result']): {queries: Entry[]; mutations: Entry[]} | null {
  const parsed = QueryCacheSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function EntryRow(props: {entry: Entry}): JSX.Element {
  return (
    <div class="flex flex-col gap-1">
      <CardRow>
        <span class="text-chat-text-2 min-w-0 truncate">{props.entry.key}</span>
        <Chip kind="pill" value={props.entry.state} tone={props.entry.state === 'error' ? 'danger' : undefined} />
        <Show when={props.entry.observers !== null}>
          <span class="text-chat-text-3 shrink-0">{props.entry.observers} obs</span>
        </Show>
        <Show when={props.entry.updatedAt !== null && props.entry.updatedAt}>
          {(updatedAt) => <RelativeTime value={new Date(updatedAt())} class="text-chat-text-3 ml-auto shrink-0" />}
        </Show>
      </CardRow>
      <Show when={props.entry.value !== undefined && props.entry.value !== null}>
        <JsonValue value={props.entry.value} name={`${props.entry.key}.json`} />
      </Show>
    </div>
  )
}

export function QueryCacheCard(props: ToolCardProps): JSX.Element {
  const cache = () => parseCache(props.result)
  const summary = () => {
    const value = cache()
    if (!value) return ''
    const count = value.queries.length
    return `${count} ${count === 1 ? 'query' : 'queries'}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={cache()}>
        {(value) => (
          <CardRows>
            <Show when={value().queries.length === 0 && value().mutations.length === 0}>
              <CardNote>no cached queries</CardNote>
            </Show>
            <For each={value().queries}>{(entry) => <EntryRow entry={entry} />}</For>
            <Show when={value().mutations.length > 0}>
              <CardNote class="mt-1">mutations</CardNote>
              <For each={value().mutations}>{(entry) => <EntryRow entry={entry} />}</For>
            </Show>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}
