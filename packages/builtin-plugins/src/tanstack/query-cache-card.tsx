import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {CacheEntry} from '@conciv/plugin-tanstack/rpc'
import {Chip, ErrorBlock, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {RelativeTime, TruncatedText} from '@conciv/ui-kit-system'
import {CardNote, CardRow, CardRows, settledCardBody, InspectionCard, JsonValue} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

const EntrySchema = CacheEntry.extend({
  state: CacheEntry.shape.state.default('fresh'),
  status: CacheEntry.shape.status.default(null),
  observers: CacheEntry.shape.observers.default(null),
  updatedAt: CacheEntry.shape.updatedAt.default(null),
  error: CacheEntry.shape.error.default(null),
}).loose()

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
        <TruncatedText class="text-chat-text-2 min-w-0" text={props.entry.key} />
        <Chip kind="pill" value={props.entry.state} tone={props.entry.state === 'error' ? 'danger' : undefined} />
        <Show when={props.entry.observers !== null}>
          <span class="text-chat-text-3 shrink-0">{props.entry.observers} obs</span>
        </Show>
        <Show when={props.entry.updatedAt !== null && props.entry.updatedAt}>
          {(updatedAt) => <RelativeTime value={new Date(updatedAt())} class="text-chat-text-3 ms-auto shrink-0" />}
        </Show>
      </CardRow>
      <Show when={props.entry.error}>{(error) => <ErrorBlock message={error()} />}</Show>
      <Show when={props.entry.value !== undefined && props.entry.value !== null}>
        <JsonValue value={props.entry.value} name={`${props.entry.key}.json`} />
      </Show>
    </div>
  )
}

function QueryCacheCard(props: ToolCardProps): JSX.Element {
  const cache = () => parseCache(props.result)
  const summary = () => {
    const value = cache()
    if (!value) return ''
    const queries = countLabel(value.queries.length, 'query', 'queries')
    const mutationCount = value.mutations.length
    if (mutationCount === 0) return queries
    return `${queries} · ${countLabel(mutationCount, 'mutation', 'mutations')}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={cache()}>
        {(value) => (
          <CardRows>
            <Show when={value().queries.length === 0 && value().mutations.length === 0}>
              <CardNote>no cached queries</CardNote>
            </Show>
            <Show when={value().queries.length > 0}>
              <CardNote>queries</CardNote>
              <For each={value().queries}>{(entry) => <EntryRow entry={entry} />}</For>
            </Show>
            <Show when={value().mutations.length > 0}>
              <CardNote class="pt-1">mutations</CardNote>
              <For each={value().mutations}>{(entry) => <EntryRow entry={entry} />}</For>
            </Show>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

export const queryCacheCard: ToolCardView = {
  render: QueryCacheCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, parseCache(result) !== null),
}
