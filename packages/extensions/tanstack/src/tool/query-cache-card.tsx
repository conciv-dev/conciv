import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {DatabaseZap} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {InspectionCard} from './card-shared.js'

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

function ageOf(updatedAt: number | null): string {
  if (updatedAt === null) return ''
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)}m`
}

function QueryIcon(): JSX.Element {
  return <DatabaseZap size={14} />
}

function EntryRow(props: {entry: Entry}): JSX.Element {
  const age = () => ageOf(props.entry.updatedAt)
  return (
    <div class="text-[length:var(--chat-text-xs)] flex gap-2 [font-family:var(--chat-mono)] items-baseline">
      <span class="min-w-0 truncate [color:var(--chat-text-2)]">{props.entry.key}</span>
      <span class="px-1.5 rounded-[var(--chat-radius-pill)] shrink-0 [background:var(--chat-sunken)] [color:var(--chat-text-3)]">
        {props.entry.state}
      </span>
      <Show when={props.entry.observers !== null}>
        <span class="shrink-0 [color:var(--chat-text-3)]">{props.entry.observers} obs</span>
      </Show>
      <Show when={age()}>
        <span class="shrink-0 [color:var(--chat-text-3)]">{age()}</span>
      </Show>
    </div>
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
          <div class="flex flex-col gap-0.5">
            <Show when={value().queries.length === 0 && value().mutations.length === 0}>
              <div class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no cached queries</div>
            </Show>
            <For each={value().queries}>{(entry) => <EntryRow entry={entry} />}</For>
            <Show when={value().mutations.length > 0}>
              <div class="text-[length:var(--chat-text-xs)] mt-1 [color:var(--chat-text-3)]">mutations</div>
              <For each={value().mutations}>{(entry) => <EntryRow entry={entry} />}</For>
            </Show>
          </div>
        )}
      </Show>
    </InspectionCard>
  )
}
