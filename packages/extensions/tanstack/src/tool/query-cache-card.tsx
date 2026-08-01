import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {DatabaseZap} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
import {RelativeTime} from '@conciv/ui-kit-system'
import {CardNote, CardRow, CardRows, InspectionCard} from './card-shared.js'

const EntrySchema = z
  .object({
    key: z.string(),
    state: z.string().default('fresh'),
    status: z.string().nullable().default(null),
    observers: z.number().nullable().default(null),
    updatedAt: z.number().nullable().default(null),
  })
  .loose()

const QueryCacheSchema = z.object({
  queries: z.array(EntrySchema).default([]),
  mutations: z.array(EntrySchema).default([]),
})

type Entry = z.infer<typeof EntrySchema>

function parseCache(props: ToolCardProps): {queries: Entry[]; mutations: Entry[]} | null {
  const parsed = QueryCacheSchema.safeParse(parseResultPayload(props.result))
  return parsed.success ? parsed.data : null
}

function QueryIcon(): JSX.Element {
  return <DatabaseZap size={14} />
}

function EntryRow(props: {entry: Entry}): JSX.Element {
  return (
    <CardRow>
      <span class="min-w-0 truncate [color:var(--chat-text-2)]">{props.entry.key}</span>
      <ToolChip name={props.entry.state} />
      <Show when={props.entry.observers !== null}>
        <span class="shrink-0 [color:var(--chat-text-3)]">{props.entry.observers} obs</span>
      </Show>
      <Show when={props.entry.updatedAt !== null && props.entry.updatedAt}>
        {(updatedAt) => <RelativeTime value={new Date(updatedAt())} class="shrink-0 [color:var(--chat-text-3)]" />}
      </Show>
    </CardRow>
  )
}

export function QueryCacheCard(props: ToolCardProps): JSX.Element {
  const cache = () => parseCache(props)
  const summary = () => {
    const value = cache()
    if (!value) return ''
    const count = value.queries.length
    return `${count} ${count === 1 ? 'query' : 'queries'}`
  }
  return (
    <InspectionCard card={props} Icon={QueryIcon} summary={summary()}>
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
