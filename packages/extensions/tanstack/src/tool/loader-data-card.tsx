import {For, Show, type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, settledCardBody, InspectionCard, JsonValue} from './card-shared.js'

type Entry = {key: string; preview: string; value: unknown}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTruncatedMarker(value: unknown): boolean {
  return isRecord(value) && value.__conciv === 'object' && typeof value.preview === 'string'
}

function preview(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `Array(${value.length})`
  if (isRecord(value)) {
    if (isTruncatedMarker(value) && typeof value.preview === 'string') return value.preview
    const keys = Object.keys(value)
    return keys.length > 0 ? `{ ${keys.join(', ')} }` : '{}'
  }
  return String(value)
}

function toEntries(payload: unknown): Entry[] {
  if (isRecord(payload)) {
    return Object.entries(payload).map(([key, value]) => ({key, preview: preview(value), value}))
  }
  if (Array.isArray(payload)) {
    return payload.map((value, index) => ({key: String(index), preview: preview(value), value}))
  }
  return [{key: 'value', preview: preview(payload), value: payload}]
}

function parseEntries(result: ToolCardProps['result']): Entry[] | null {
  const payload = parseResultPayload(result)
  if (payload === undefined || payload === null) return null
  return toEntries(payload)
}

export function LoaderDataCard(props: ToolCardProps): JSX.Element {
  const entries = () => parseEntries(props.result)
  const summary = () => {
    const list = entries()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'key' : 'keys'}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={entries()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(entry) => (
                <div class="flex flex-col gap-1">
                  <CardRow>
                    <span class="text-chat-text-2 min-w-0 truncate">{entry.key}</span>
                    <span class="text-chat-text-3 min-w-0 truncate">{entry.preview}</span>
                  </CardRow>
                  <Show when={!isTruncatedMarker(entry.value)}>
                    <JsonValue value={entry.value} name={`${entry.key}.json`} />
                  </Show>
                </div>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

export const loaderDataCard: ToolCardView = {
  render: LoaderDataCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, parseEntries(result) !== null),
}
