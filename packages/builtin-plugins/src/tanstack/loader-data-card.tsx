import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {isPlainObject} from 'es-toolkit'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {TruncatedText} from '@conciv/ui-kit-system'
import {CardRow, CardRows, InspectionCard, JsonValue, parseOutput} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

type Entry = {key: string; preview: string; value: unknown}

const TruncatedMarker = z.looseObject({__conciv: z.string(), preview: z.string()})

function isTruncatedMarker(value: unknown): boolean {
  return TruncatedMarker.safeParse(value).success
}

function opensAsTree(value: unknown): boolean {
  return (Array.isArray(value) || isPlainObject(value)) && !isTruncatedMarker(value)
}

function preview(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `Array(${value.length})`
  const marker = TruncatedMarker.safeParse(value)
  if (marker.success) return marker.data.preview
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    return keys.length > 0 ? `{ ${keys.join(', ')} }` : '{}'
  }
  return String(value)
}

function toEntries(payload: unknown): Entry[] {
  if (isPlainObject(payload) && !isTruncatedMarker(payload)) {
    return Object.entries(payload).map(([key, value]) => ({key, preview: preview(value), value}))
  }
  if (Array.isArray(payload)) {
    return payload.map((value, index) => ({key: String(index), preview: preview(value), value}))
  }
  return [{key: 'value', preview: preview(payload), value: payload}]
}

const LoaderDataPayload = z.looseObject({routeId: z.string(), data: z.unknown()})

function loaderDataPayload(result: string | undefined): z.infer<typeof LoaderDataPayload> | null {
  const parsed = LoaderDataPayload.safeParse(parseOutput(result))
  return parsed.success ? parsed.data : null
}

function parseEntries(result: string | undefined): Entry[] | null {
  const payload = loaderDataPayload(result)
  if (payload === null || payload.data === undefined || payload.data === null) return null
  return toEntries(payload.data)
}

function LoaderDataCard(props: ToolProps): JSX.Element {
  const entries = () => parseEntries(props.output)
  const summary = () => {
    const list = entries()
    if (!list) return ''
    const keys = countLabel(list.length, 'key', 'keys')
    const routeId = loaderDataPayload(props.output)?.routeId
    return routeId ? `${keys} · ${routeId}` : keys
  }
  return (
    <InspectionCard {...props} summary={summary()} hasContent={parseEntries(props.output) !== null}>
      <Show when={entries()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(entry) => (
                <div class="flex flex-col gap-1">
                  <CardRow>
                    <TruncatedText class="text-chat-text-2 min-w-0" text={entry.key} />
                    <Show when={!opensAsTree(entry.value)}>
                      <TruncatedText class="text-chat-text-3 min-w-0" text={entry.preview} />
                    </Show>
                  </CardRow>
                  <Show when={opensAsTree(entry.value)}>
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

export const loaderDataCard: ToolComponent = LoaderDataCard
