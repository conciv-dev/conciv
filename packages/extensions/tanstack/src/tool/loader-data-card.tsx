import {For, Show, type JSX} from 'solid-js'
import {Database} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {CardRow, CardRows, InspectionCard} from './card-shared.js'

type Entry = {key: string; preview: string}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function preview(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `Array(${value.length})`
  if (isRecord(value)) {
    if (typeof value.preview === 'string') return value.preview
    const keys = Object.keys(value)
    return keys.length > 0 ? `{ ${keys.join(', ')} }` : '{}'
  }
  return String(value)
}

function toEntries(payload: unknown): Entry[] {
  if (isRecord(payload)) return Object.entries(payload).map(([key, value]) => ({key, preview: preview(value)}))
  if (Array.isArray(payload)) return payload.map((value, index) => ({key: String(index), preview: preview(value)}))
  return [{key: 'value', preview: preview(payload)}]
}

function parseEntries(props: ToolCardProps): Entry[] | null {
  const payload = parseResultPayload(props.result)
  if (payload === undefined || payload === null) return null
  return toEntries(payload)
}

function LoaderIcon(): JSX.Element {
  return <Database size={14} />
}

export function LoaderDataCard(props: ToolCardProps): JSX.Element {
  const entries = () => parseEntries(props)
  const summary = () => {
    const list = entries()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'key' : 'keys'}`
  }
  return (
    <InspectionCard card={props} Icon={LoaderIcon} summary={summary()}>
      <Show when={entries()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(entry) => (
                <CardRow>
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{entry.key}</span>
                  <span class="min-w-0 truncate [color:var(--chat-text-3)]">{entry.preview}</span>
                </CardRow>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}
